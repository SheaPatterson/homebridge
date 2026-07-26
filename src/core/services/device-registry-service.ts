// src/core/services/device-registry-service.ts

import { DeviceAdapter } from '@/core/types';
import { AdapterRegistry } from '../adapter-registry';
import { DeviceRepository } from '../repositories/device-repository';
import { RoomRepository } from '../repositories/room-repository';
import { EventEmitter } from '../event-bus';
import { StateService } from './state-service';

/**
 * Composes the adapter output with persistent room data to provide a unified, normalized view of all devices.
 */
export class DeviceRegistryService {
    private deviceRepo: DeviceRepository;
    private roomRepo: RoomRepository;
    private registry: AdapterRegistry;
    private stateService: StateService;

    constructor(deviceRepo: DeviceRepository, roomRepo: RoomRepository, adapterRegistry: AdapterRegistry) {
        this.deviceRepo = deviceRepo;
        this.roomRepo = roomRepo;
        this.registry = adapterRegistry;
        // Initialize the state service which handles event subscriptions
        this.stateService = new StateService(
            eventBus, 
            deviceRepo, 
            roomRepo, 
            this // Pass self reference for internal communication if needed
        );
    }

    /**
     * Main method to synchronize the live state from adapters with the persistent database.
     */
    async syncAllStates(): Promise<void> {
        console.log("[Service] Starting full system state synchronization...");
        // In a real implementation, this would iterate over all active adapter streams/health checks.
        await this.stateService.syncAllStates(); 
    }

    /**
     * Exposes the event handling mechanism to be called by the global event bus listener.
     */
    handleDeviceEvent(event: any): Promise<void> {
        return this.stateService.handleDeviceEvent(event);
    }
}