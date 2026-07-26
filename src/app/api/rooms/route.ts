// src/app/api/rooms/route.ts

import { NextResponse } from 'next/server';
import { RoomService } from '@/core/services/room-service';
import { DeviceRepository } from '@/core/repositories/device-repository';
import { RoomRepository } from '@/core/repositories/room-repository';
import { AdapterRegistry } from '@/core/adapter-registry';
import { MockAdapter } from '@/adapters/mock';
import { EventEmitter } from '@/core/event-bus';
import { StateService } from '@/core/services/state-service';

// --- Initialization (Simulating global setup) ---
const db = initializeDatabase(); // Assuming this function is available globally or imported correctly
runMigrations(db); 

// Initialize core services
const mockAdapterInstance = new MockAdapter({ eventBus: null as any, dbClient: db }); 
const registry = new AdapterRegistry({ eventBus: null as any, dbClient: db });
registry.register(mockAdapterInstance);

// We need to ensure the state service is initialized *after* the adapters are registered
const deviceRepo = new DeviceRepository(db);
const roomRepo = new RoomRepository(db);
const stateService = new StateService(eventBus, deviceRepo, roomRepo, registry);

// Initialize the main coordinating service
const roomService = new RoomService(roomRepo, null as any); // Pass a placeholder for now

export async function GET() {
    try {
        await registry.startAll(); 

        // Simulate initial state sync to populate rooms/devices before reading them
        await stateService.syncAllStates(); 

        const layout = await roomService.getHomeLayout();

        return NextResponse.json({
            success: true,
            layout: layout,
        });

    } catch (error) {
        console.error("Error fetching home layout:", error);
        return NextResponse.json({ success: false, message: 'Failed to retrieve home layout.' }, { status: 500 });
    } finally {
        await registry.stopAll();
    }
}