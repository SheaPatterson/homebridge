// src/adapters/mock/index.ts

import { DeviceAdapter } from "../../core/types";
import { EventEmitter } from "../../core/event-bus";

/**
 * A mock adapter for development and testing purposes. 
 * Simulates two devices (a light and a sensor) without needing real hardware.
 */
export class MockAdapter implements DeviceAdapter {
    public readonly id: string = 'mock';
    public readonly displayName: string = 'Mock Adapter';
    public readonly version: string = '1.0.0-dev';

    private eventBus: EventEmitter;
    private context: any; // Using 'any' for simplicity in this mock setup

    constructor(context: { eventBus: EventEmitter, dbClient: any }) {
        this.eventBus = context.eventBus;
        this.context = context;
    }

    async start(ctx: any): Promise<void> {
        console.log(`[MockAdapter] Started successfully.`);
        // Simulate initial device discovery event
        await new Promise(resolve => setTimeout(resolve, 10)); // Wait for startup
        this.eventBus.emit('device:discovery', [
            { id: 'mock-light-1', name: 'Living Room Light', protocol: 'mock', type: 'light', lastSeen: Date.now() },
            { id: 'mock-sensor-2', name: 'Hallway Temp Sensor', protocol: 'mock', type: 'sensor', lastSeen: Date.now() }
        ]);
    }

    async stop(): Promise<void> {
        console.log(`[MockAdapter] Stopped.`);
    }

    // Simulates an async stream of discovered devices
    startDiscovery(): AsyncIterable<any> {
        return (async function* () {
            yield { id: 'mock-light-1', name: 'Living Room Light', protocol: 'mock', type: 'light', lastSeen: Date.now() };
            await new Promise(resolve => setTimeout(resolve, 500));
        })();
    }

    async stopDiscovery(): Promise<void> {
        console.log("[MockAdapter] Discovery stopped.");
    }

    async beginPairing(input: any): AsyncIterable<any> {
        return (async function* () {
            yield { stepName: "Welcome", description: "Please enter the pairing code.", actionRequired: 'user_input' };
            await new Promise(resolve => setTimeout(resolve, 100));
            yield { stepName: "Waiting for device...", description: "Check your physical device.", actionRequired: 'network_wait' };
        })();
    }

    async abortPairing(): Promise<void> {
        console.log("[MockAdapter] Pairing aborted.");
    }

    /**
     * Simulates sending a command to the device.
     */
    async setState(deviceId: string, command: any): Promise<void> {
        console.log(`[MockAdapter] Executing state change for ${deviceId}:`, command);
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network latency
        
        // Emit a successful event after the delay
        this.eventBus.emit('device:state_change', {
            deviceId: deviceId,
            eventType: 'state_change',
            data: command.payload,
            timestamp: Date.now()
        });
    }

    onEvent(handler: (e: any) => void): Unsubscribe {
        return this.eventBus.on('device:state_change', handler);
    }

    async health(): Promise<any> {
        return { adapterId: this.id, status: "ok", lastCheck: Date.now(), message: "Mock is running fine." };
    }
}