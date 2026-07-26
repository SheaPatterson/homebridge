// src/core/repositories/device-repository.ts

import { betterSqlite3 } from 'better-sqlite3';
import { DeviceState } from '@/core/types';
import { z } from 'zod';

/**
 * Repository for interacting with the 'devices' table and state tracking.
 */
export class DeviceRepository {
    private db: any; // better-sqlite3 instance

    constructor(dbClient: any) {
        this.db = dbClient;
    }

    /**
     * Retrieves all devices known to the system, including their current online status.
     */
    async findAllDevices(): Promise<DeviceState[]> {
        const stmt = this.db.prepare("SELECT id, name, type FROM devices");
        const rows = stmt.all();
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            type: row.type,
            isOn: true, // Defaulting to online for simplicity in this phase
            lastUpdated: Date.now()
        }));
    }

    /**
     * Updates the name and type of a device (e.g., after pairing).
     */
    async updateDeviceMetadata(deviceId: string, name: string, type: string): Promise<void> {
        const stmt = this.db.prepare("INSERT OR REPLACE INTO devices (id, name, type) VALUES (?, ?, ?)");
        stmt.run(deviceId, name, type);
    }

    /**
     * Persists the current state of a device for recovery.
     */
    async saveDeviceState(device: DeviceState): Promise<void> {
        const stateJson = JSON.stringify({ 
            isOn: device.isOn, 
            brightness: device.brightness ?? null, 
            temperature: device.temperature ?? null 
        });

        // Use INSERT OR REPLACE to handle updates gracefully
        this.db.prepare(`INSERT OR REPLACE INTO device_states (device_id, state_json, last_updated) VALUES (?, ?, ?)`)
            .run(device.id, stateJson, Date.now());
    }
}