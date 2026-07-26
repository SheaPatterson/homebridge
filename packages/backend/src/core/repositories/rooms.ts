/**
 * RoomRepository — CRUD for the `rooms` and `room_devices` tables.
 */
import { z } from "zod";
import type { Persistence } from "../persistence/sqlite.js";
import type { Room } from "../types.js";

const RoomRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  ord: z.number(),
});

function rowToRoom(row: z.infer<typeof RoomRowSchema>): Room {
  return { id: row.id, name: row.name, order: row.ord };
}

export class RoomRepository {
  constructor(private readonly p: Persistence) {}

  async create(name: string, order = 0): Promise<Room> {
    const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.p.run("INSERT INTO rooms (id, name, ord) VALUES (?, ?, ?)", [id, name, order]);
    return { id, name, order };
  }

  async get(id: string): Promise<Room | undefined> {
    const row = await this.p.get("SELECT * FROM rooms WHERE id = ?", [id]);
    if (!row) return undefined;
    const parsed = RoomRowSchema.safeParse(row);
    return parsed.success ? rowToRoom(parsed.data) : undefined;
  }

  async list(): Promise<Room[]> {
    const rows = await this.p.all<unknown>("SELECT * FROM rooms ORDER BY ord, name");
    return rows
      .map((r) => RoomRowSchema.safeParse(r))
      .filter((p): p is { success: true; data: z.infer<typeof RoomRowSchema> } => p.success)
      .map((p) => rowToRoom(p.data));
  }

  async update(id: string, updates: Partial<Room>): Promise<Room | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;
    if (updates.name !== undefined) {
      await this.p.run("UPDATE rooms SET name = ? WHERE id = ?", [updates.name, id]);
    }
    if (updates.order !== undefined) {
      await this.p.run("UPDATE rooms SET ord = ? WHERE id = ?", [updates.order, id]);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.p.run("DELETE FROM rooms WHERE id = ?", [id]);
    await this.p.run("DELETE FROM room_devices WHERE room_id = ?", [id]);
    // Detach devices from the removed room.
    await this.p.run("UPDATE devices SET room_id = NULL WHERE room_id = ?", [id]);
  }

  async assignDevice(roomId: string, deviceId: string): Promise<void> {
    await this.p.run(
      "INSERT INTO room_devices (room_id, device_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      [roomId, deviceId],
    );
    await this.p.run("UPDATE devices SET room_id = ? WHERE id = ?", [roomId, deviceId]);
  }

  async unassignDevice(roomId: string, deviceId: string): Promise<void> {
    await this.p.run("DELETE FROM room_devices WHERE room_id = ? AND device_id = ?", [
      roomId,
      deviceId,
    ]);
    await this.p.run("UPDATE devices SET room_id = NULL WHERE id = ? AND room_id = ?", [
      deviceId,
      roomId,
    ]);
  }
}
