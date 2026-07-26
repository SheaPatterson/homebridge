// src/core/repositories/room-repository.ts

import { betterSqlite3 } from 'better-sqlite3';
import { z } from 'zod';

/**
 * Repository for managing room structures and device assignments.
 */
export class RoomRepository {
    private db: any; // better-sqlite3 instance

    constructor(dbClient: any) {
        this.db = dbClient;
    }

    /**
     * Retrieves all defined rooms in the system.
     */
    async findAllRooms(): Promise<{ id: string, name: string }[]> {
        const stmt = this.db.prepare("SELECT id, name FROM rooms");
        return stmt.all();
    }

    /**
     * Assigns a device to a specific room (or creates the room if it doesn't exist).
     */
    async assignDeviceToRoom(roomId: string, deviceId: string): Promise<void> {
        // 1. Ensure Room exists
        await this.ensureRoomExists(roomId);

        // 2. Link Device to Room (using INSERT OR IGNORE for idempotency)
        const stmt = this.db.prepare("INSERT OR IGNORE INTO room_devices (room_id, device_id) VALUES (?, ?)");
        stmt.run(roomId, deviceId);
    }

    /**
     * Ensures a room exists in the database, creating it if necessary.
     */
    async ensureRoomExists(roomId: string): Promise<void> {
        const stmt = this.db.prepare("INSERT OR IGNORE INTO rooms (id, name) VALUES (?, ?)");
        stmt.run(roomId, roomId); // Using ID as the display name for simplicity
    }

    /**
     * Retrieves all devices associated with a given room ID.
     */
    async getDevicesInRoom(roomId: string): Promise<{ deviceId: string, name: string }[]> {
        const stmt = this.db.prepare("SELECT T1.device_id, T2.name FROM room_devices AS T1 JOIN devices AS T2 ON T1.device_id = T2.id WHERE T1.room_id = ?");
        return stmt.all(roomId);
    }
}