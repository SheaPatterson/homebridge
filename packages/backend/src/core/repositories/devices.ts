/**
 * DeviceRepository — CRUD for the `devices` table.
 *
 * Devices are protocol-agnostic; their shape is the union of the
 * `Device` interface in `core/types.ts`. State is stored as a JSON string
 * for forward compatibility (Phase 2's DeviceRegistry can add capabilities
 * without a migration).
 */
import { z } from "zod";
import { DeviceCommandSchema } from "../types.js";
import type { Persistence } from "../persistence/sqlite.js";
import type { Device, DeviceKind, DeviceCapability, DeviceState } from "../types.js";

const DeviceRowSchema = z.object({
  id: z.string(),
  adapter_id: z.string(),
  name: z.string(),
  kind: z.string(),
  capabilities: z.string(),
  state: z.string(),
  reachable: z.number().transform((v) => v === 1),
  room_id: z.string().nullable(),
  last_updated: z.number(),
});

function rowToDevice(row: z.infer<typeof DeviceRowSchema>): Device {
  return {
    id: row.id,
    adapterId: row.adapter_id,
    name: row.name,
    kind: row.kind as DeviceKind,
    capabilities: JSON.parse(row.capabilities) as DeviceCapability[],
    state: JSON.parse(row.state) as DeviceState,
    reachable: row.reachable,
    roomId: row.room_id,
    lastUpdated: row.last_updated,
  };
}

export class DeviceRepository {
  constructor(private readonly p: Persistence) {}

  async upsert(device: Device): Promise<void> {
    await this.p.run(
      `INSERT INTO devices (id, adapter_id, name, kind, capabilities, state, reachable, room_id, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         kind = excluded.kind,
         capabilities = excluded.capabilities,
         state = excluded.state,
         reachable = excluded.reachable,
         room_id = excluded.room_id,
         last_updated = excluded.last_updated`,
      [
        device.id,
        device.adapterId,
        device.name,
        device.kind,
        JSON.stringify(device.capabilities),
        JSON.stringify(device.state),
        device.reachable ? 1 : 0,
        device.roomId,
        device.lastUpdated,
      ],
    );
  }

  async remove(id: string): Promise<void> {
    await this.p.run("DELETE FROM devices WHERE id = ?", [id]);
    await this.p.run("DELETE FROM room_devices WHERE device_id = ?", [id]);
  }

  async get(id: string): Promise<Device | undefined> {
    const row = await this.p.get("SELECT * FROM devices WHERE id = ?", [id]);
    if (!row) return undefined;
    const parsed = DeviceRowSchema.safeParse(row);
    return parsed.success ? rowToDevice(parsed.data) : undefined;
  }

  async list(): Promise<Device[]> {
    const rows = await this.p.all<unknown>("SELECT * FROM devices ORDER BY name");
    return rows
      .map((r) => DeviceRowSchema.safeParse(r))
      .filter((p): p is { success: true; data: z.infer<typeof DeviceRowSchema> } => p.success)
      .map((p) => rowToDevice(p.data));
  }

  async listByRoom(roomId: string): Promise<Device[]> {
    const rows = await this.p.all<unknown>(
      "SELECT * FROM devices WHERE room_id = ? ORDER BY name",
      [roomId],
    );
    return rows
      .map((r) => DeviceRowSchema.safeParse(r))
      .filter((p): p is { success: true; data: z.infer<typeof DeviceRowSchema> } => p.success)
      .map((p) => rowToDevice(p.data));
  }

  async setRoom(deviceId: string, roomId: string | null): Promise<void> {
    await this.p.run("UPDATE devices SET room_id = ? WHERE id = ?", [roomId, deviceId]);
  }

  async updateState(deviceId: string, state: DeviceState): Promise<void> {
    await this.p.run(
      "UPDATE devices SET state = ?, last_updated = ? WHERE id = ?",
      [JSON.stringify(state), Date.now(), deviceId],
    );
  }

  async setReachable(deviceId: string, reachable: boolean): Promise<void> {
    await this.p.run("UPDATE devices SET reachable = ? WHERE id = ?", [reachable ? 1 : 0, deviceId]);
  }
}

/** Validate a `DeviceCommand` from a route handler. */
export function parseDeviceCommand(input: unknown) {
  return DeviceCommandSchema.parse(input);
}