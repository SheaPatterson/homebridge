/**
 * DeviceRegistry — the in-memory normalised `Device[]` view the UI consumes.
 *
 * Composes:
 *   - the AdapterRegistry (for live adapter events)
 *   - the DeviceRepository (for persistence)
 *   - the RoomRepository  (for room → device grouping)
 *
 * Owns:
 *   - an in-process `Map<deviceId, Device>` cache
 *   - per-subject `Set<Device[]>` emitters
 *
 * The cache is the source of truth for the UI; the EventBus pushes adapter
 * events into it; reads are O(1).
 */
import type { EventBus } from "./event-bus.js";
import type { AdapterRegistry } from "./registry.js";
import type { DeviceRepository } from "./repositories/devices.js";
import type { RoomRepository } from "./repositories/rooms.js";
import type { Device, DeviceCommand } from "./types.js";

export type DeviceSnapshot = {
  devices: Device[];
  byRoom: Record<string, Device[]>;
};

export type DeviceListener = (snap: DeviceSnapshot) => void;

export class DeviceRegistry {
  private cache = new Map<string, Device>();
  private listeners = new Set<DeviceListener>();

  constructor(
    private readonly bus: EventBus,
    private readonly adapters: AdapterRegistry,
    private readonly devices: DeviceRepository,
    private readonly rooms: RoomRepository,
  ) {
    this.bus.on((evt) => {
      if (evt.type === "device_state_changed") {
        this.updateState(evt.deviceId, evt.state);
      } else if (evt.type === "device_added") {
        this.upsert(evt.device);
      } else if (evt.type === "device_removed") {
        this.remove(evt.deviceId);
      } else if (evt.type === "adapter_event") {
        const e = evt.event;
        if (e.type === "device_unreachable") {
          this.setReachable(e.deviceId, false);
        }
      }
    });
  }

  /** Load persisted devices into the cache. Call once at boot. */
  async hydrate(): Promise<void> {
    const list = await this.devices.list();
    for (const d of list) this.cache.set(d.id, d);
  }

  snapshot(): DeviceSnapshot {
    const devices = Array.from(this.cache.values());
    const byRoom: Record<string, Device[]> = {};
    for (const d of devices) {
      const key = d.roomId ?? "_unassigned";
      (byRoom[key] ??= []).push(d);
    }
    return { devices, byRoom };
  }

  list(): Device[] {
    return Array.from(this.cache.values());
  }

  get(id: string): Device | undefined {
    return this.cache.get(id);
  }

  /** Send a command through the adapter and update the cache. */
  async command(deviceId: string, cmd: DeviceCommand): Promise<void> {
    const device = this.cache.get(deviceId);
    if (!device) throw new Error(`Unknown device: ${deviceId}`);
    await this.adapters.setState(device.adapterId, deviceId, cmd);
    // Optimistic local update; the adapter's `device_state_changed` event
    // will re-broadcast and overwrite.
    const updated: Device = {
      ...device,
      state: { ...device.state, ...applyCommand(cmd) },
      lastUpdated: Date.now(),
    };
    this.cache.set(deviceId, updated);
    await this.devices.updateState(deviceId, updated.state);
    this.notify();
  }

  onChange(listener: DeviceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private upsert(device: Device): void {
    this.cache.set(device.id, device);
    void this.devices.upsert(device);
    this.notify();
  }

  private remove(id: string): void {
    this.cache.delete(id);
    void this.devices.remove(id);
    this.notify();
  }

  private updateState(id: string, partial: Device["state"]): void {
    const existing = this.cache.get(id);
    if (!existing) return;
    const updated: Device = {
      ...existing,
      state: { ...existing.state, ...partial },
      lastUpdated: Date.now(),
    };
    this.cache.set(id, updated);
    void this.devices.updateState(id, updated.state);
    this.notify();
  }

  private setReachable(id: string, reachable: boolean): void {
    const existing = this.cache.get(id);
    if (!existing) return;
    this.cache.set(id, { ...existing, reachable });
    void this.devices.setReachable(id, reachable);
    this.notify();
  }

  private notify(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}

function applyCommand(cmd: DeviceCommand): Partial<Device["state"]> {
  switch (cmd.kind) {
    case "set_on":
      return { on: cmd.on };
    case "set_brightness":
      return { brightness: cmd.brightness };
    case "set_temperature":
      return { temperature: cmd.temperature };
  }
}
