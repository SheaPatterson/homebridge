/**
 * RoomService — orchestrates rooms + their device assignments.
 */
import type { EventBus } from "./event-bus.js";
import type { RoomRepository } from "./repositories/rooms.js";
import type { Room } from "./types.js";

export class RoomService {
  constructor(
    private readonly bus: EventBus,
    private readonly rooms: RoomRepository,
  ) {}

  async list(): Promise<Room[]> {
    return this.rooms.list();
  }

  async create(name: string, order = 0): Promise<Room> {
    const room = await this.rooms.create(name, order);
    this.bus.emit({ type: "room_added", room });
    return room;
  }

  async update(id: string, updates: Partial<Room>): Promise<Room | undefined> {
    const room = await this.rooms.update(id, updates);
    if (room) this.bus.emit({ type: "room_updated", room });
    return room;
  }

  async remove(id: string): Promise<void> {
    await this.rooms.remove(id);
    this.bus.emit({ type: "room_removed", roomId: id });
  }

  async assignDevice(roomId: string, deviceId: string): Promise<void> {
    await this.rooms.assignDevice(roomId, deviceId);
  }

  async unassignDevice(roomId: string, deviceId: string): Promise<void> {
    await this.rooms.unassignDevice(roomId, deviceId);
  }
}
