// src/core/services/room-service.ts

import { RoomRepository } from '../repositories/room-repository';
import { DeviceRegistryService } from './device-registry-service';

/**
 * Coordinates room assignments and provides a high-level view of the home layout.
 */
export class RoomService {
    private roomRepo: RoomRepository;
    private deviceRegistry: DeviceRegistryService;

    constructor(roomRepo: RoomRepository, deviceRegistry: DeviceRegistryService) {
        this.roomRepo = roomRepo;
        this.deviceRegistry = deviceRegistry;
    }

    /**
     * Retrieves the full structure of rooms and their associated devices.
     */
    async getHomeLayout(): Promise<{ rooms: { id: string, name: string }[], devicesByRoom: Record<string, any[]> }> {
        const rooms = await this.roomRepo.findAllRooms();
        const layout: Record<string, any[]> = {};

        for (const room of rooms) {
            // Fetch all devices linked to this room from the repository
            const devicesInRoom = await this.roomRepo.getDevicesInRoom(room.id);
            layout[room.id] = devicesInRoom;
        }

        return { rooms, devicesByRoom: layout };
    }

    /**
     * Assigns a device to a room and updates the persistent record.
     */
    async assignDeviceToRoom(roomId: string, deviceId: string): Promise<void> {
        await this.roomRepo.assignDeviceToRoom(roomId, deviceId);
        console.log(`[RoomService] Successfully assigned ${deviceId} to room ${roomId}.`);
    }
}