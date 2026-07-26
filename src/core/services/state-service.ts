// src/core/services/state-service.ts

import { DeviceAdapter } from '@/core/types';
import { EventEmitter } from '../event-bus';
import { DeviceRepository } from '../repositories/device-repository';
import { RoomRepository } from '../repositories/room-repository';
import { AdapterRegistry } from '../adapter-registry';

/**
 * Central service responsible for listening to all device events and ensuring the database state is consistent.
 */
export class StateService {
    private eventBus: EventEmitter;
    private deviceRepo: DeviceRepository;
    private roomRepo: RoomRepository;
    private registry: AdapterRegistry;

    constructor(eventBus: EventEmitter, deviceRepo: DeviceRepository, roomRepo: RoomRepository, adapterRegistry: AdapterRegistry) {
        this.eventBus = eventBus;
        this.deviceRepo = deviceRepo;
        this.roomRepo = roomRepo;
        this.registry = adapterRegistry;

        // Subscribe to the global event bus immediately upon instantiation
        this.setupEventHandlers();
    }

    /**
     * Sets up listeners for all relevant domain events.
     */
    private setupEventHandlers(): void {
        // Listen for state changes from any device/adapter
        this.eventBus.on('device:state_change', async (event: any) => {
            console.log(`[StateService] Received event: ${event.deviceId} state change.`);
            await this.handleDeviceEvent(event);
        });

        // Listen for new device discoveries
        this.eventBus.on('device:discovery', async (devices: any[]) => {
            for (const device of devices) {
                console.log(`[StateService] Received discovery event for ${device.name}.`);
                await this.handleDeviceDiscovery(device);
            }
        });
    }

    /**
     * Processes a state change event, updating persistence and potentially notifying rooms.
     */
    private async handleDeviceEvent(event: any): Promise<void> {
        const deviceId = event.deviceId;
        const data = event.data;

        // 1. Update the core device metadata (if needed)
        await this.deviceRepo.updateDeviceMetadata(deviceId, 'Unknown', 'unknown'); // Placeholder update

        // 2. Save the new state to persistence for recovery
        const mockState: any = { id: deviceId, name: 'Mock Name', type: 'mock', isOn: data.isOn ?? true, brightness: data.brightness, temperature: data.temperature, lastUpdated: Date.now() };
        this.deviceRepo.saveDeviceState(mockState);

        // 3. (Future) Notify RoomService to update UI components in rooms that contain this device.
    }

    /**
     * Processes a newly discovered device, ensuring it's registered and potentially assigned to default rooms.
     */
    private async handleDeviceDiscovery(device: any): Promise<void> {
        const deviceId = device.id;
        // 1. Update metadata in the DB
        await this.deviceRepo.updateDeviceMetadata(deviceId, device.name, device.type);

        // 2. (Future) Assign to a default room or prompt user for assignment.
    }
}