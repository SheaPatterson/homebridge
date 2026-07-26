/**
 * In-process EventBus.
 *
 * A thin wrapper around Node's `EventEmitter` that provides a typed API for
 * adapter events and domain events. Future-proofs IPC if we ever split the
 * runtime into multiple processes.
 *
 * Phase 1 of the v2 plan. Pure logic, no I/O — covered by unit tests.
 */
import { EventEmitter } from "node:events";
import type { AdapterEvent, Device, Room } from "./types.js";

export type DomainEvent =
  | { type: "device_added"; device: Device }
  | { type: "device_removed"; deviceId: string }
  | { type: "device_state_changed"; deviceId: string; state: Device["state"] }
  | { type: "room_added"; room: Room }
  | { type: "room_updated"; room: Room }
  | { type: "room_removed"; roomId: string }
  | { type: "adapter_event"; event: AdapterEvent };

export type Unsubscribe = () => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // The default of 10 listeners is too low for a hub with many adapters.
    this.emitter.setMaxListeners(1000);
  }

  emit(event: DomainEvent): void {
    this.emitter.emit("domain", event);
    if (event.type === "adapter_event") {
      this.emitter.emit(`adapter:${event.event.type}`, event.event);
    }
  }

  on(handler: (event: DomainEvent) => void): Unsubscribe {
    this.emitter.on("domain", handler);
    return () => this.emitter.off("domain", handler);
  }

  onAdapterEvent<T extends AdapterEvent["type"]>(
    type: T,
    handler: (event: Extract<AdapterEvent, { type: T }>) => void,
  ): Unsubscribe {
    const wrapped = (raw: AdapterEvent) => {
      if (raw.type === type) {
        handler(raw as Extract<AdapterEvent, { type: T }>);
      }
    };
    this.emitter.on(`adapter:${type}`, wrapped);
    return () => this.emitter.off(`adapter:${type}`, wrapped);
  }

  listenerCount(): number {
    return this.emitter.listenerCount("domain");
  }
}
