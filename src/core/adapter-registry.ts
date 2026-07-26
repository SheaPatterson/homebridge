// src/core/adapter-registry.ts

import { DeviceAdapter } from "./types";
import { EventEmitter } from "./event-bus";
import { AdapterContext } from "./types";

/**
 * Manages the lifecycle and discovery of all connected device adapters.
 * Ensures that one adapter failure does not crash the entire system.
 */
export class AdapterRegistry {
    private adapters: Map<string, DeviceAdapter> = new Map();
    private context: AdapterContext;

    constructor(context: AdapterContext) {
        this.context = context;
    }

    /**
     * Registers a new adapter instance with the registry.
     * @param adapter The concrete implementation of DeviceAdapter.
     */
    register(adapter: DeviceAdapter): void {
        if (this.adapters.has(adapter.id)) {
            console.warn(`[Registry] Adapter ${adapter.id} is already registered. Overwriting.`);
        }
        this.adapters.set(adapter.id, adapter);
        console.log(`[Registry] Successfully registered adapter: ${adapter.displayName}`);
    }

    /**
     * Starts all registered adapters and begins discovery processes.
     */
    async startAll(): Promise<void> {
        console.log("[Registry] Starting all connected adapters...");
        const promises = Array.from(this.adapters.values()).map(adapter => 
            adapter.start(this.context).catch(err => {
                console.error(`[Registry Error] Failed to start adapter ${adapter.id}:`, err);
                return null; // Allow other adapters to continue starting
            })
        );
        await Promise.all(promises);

        // Start discovery for all successful adapters
        for (const adapter of this.adapters.values()) {
             if (adapter.startDiscovery) {
                 console.log(`[Registry] Starting discovery for ${adapter.id}...`);
                 // In a real implementation, we'd manage the async iterable lifecycle here.
             }
        }
    }

    /**
     * Stops all adapters gracefully.
     */
    async stopAll(): Promise<void> {
        console.log("[Registry] Stopping all connected adapters...");
        const promises = Array.from(this.adapters.values()).map(adapter => 
            adapter.stop().catch(err => {
                console.error(`[Registry Error] Failed to stop adapter ${adapter.id}:`, err);
                return null;
            })
        );
        await Promise.all(promises);
    }

    /**
     * Retrieves a specific adapter by ID.
     */
    getAdapter(id: string): DeviceAdapter | undefined {
        return this.adapters.get(id);
    }

    /**
     * Gets all currently registered adapters.
     */
    getAllAdapters(): Map<string, DeviceAdapter> {
        return this.adapters;
    }
}