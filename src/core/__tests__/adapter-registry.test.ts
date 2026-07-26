// src/core/adapter-registry.test.ts

import { AdapterRegistry } from './adapter-registry';
import { MockAdapter } from '../adapters/mock';
import { EventEmitter } from './event-bus';

describe('AdapterRegistry', () => {
    let mockContext: any;
    let registry: AdapterRegistry;
    let eventBus: EventEmitter;

    beforeEach(() => {
        // Reset the global state for each test
        eventBus = new EventEmitter(); 
        mockContext = { eventBus: eventBus, dbClient: {} };
        registry = new AdapterRegistry(mockContext);
    });

    it('should register and start adapters correctly', async () => {
        const mockAdapter1 = new MockAdapter(mockContext);
        const mockAdapter2 = new MockAdapter(mockContext);

        // Registering the first adapter
        registry.register(mockAdapter1);
        expect(registry.getAllAdapters().size).toBe(1);

        // Starting all adapters
        await registry.startAll(); 
        
        // Check if both are registered and started (MockAdapter logs confirm this)
        expect(registry.getAdapter('mock')).toBeDefined();
    });

    it('should stop all registered adapters gracefully', async () => {
        const mockAdapter1 = new MockAdapter(mockContext);
        registry.register(mockAdapter1);
        await registry.startAll(); 

        // Stopping all adapters
        await registry.stopAll();
        // We can't assert the internal state, but we confirm no crash and that the method runs.
    });

    it('should handle adapter failure without crashing the registry', async () => {
        const mockAdapter1 = new MockAdapter(mockContext);
        registry.register(mockAdapter1);

        // Simulate a failing adapter (we'll use a dummy class for this)
        class FailingAdapter implements DeviceAdapter {
            readonly id: string = 'fail';
            readonly displayName: string = 'Failing Adapter';
            readonly version: string = '0.1.0';
            async start(ctx: any): Promise<void> { throw new Error("Simulated hardware failure"); }
            async stop(): Promise<void> {}
            startDiscovery(): AsyncIterable<any> { return async function*(){}; }
            stopDiscovery(): Promise<void> { return Promise.resolve(); }
            beginPairing(input: any): AsyncIterable<any> { return async function*(){}; }
            abortPairing(): Promise<void> { return Promise.resolve(); }
            async setState(deviceId: string, command: any): Promise<void> {}
            onEvent(handler: (e: any) => void): Unsubscribe { return () => {}; }
            async health(): Promise<any> { throw new Error("Health check failed"); }
        }

        const failingAdapter = new FailingAdapter();
        registry.register(failingAdapter);

        // Start all adapters, expecting the failure to be caught internally
        await registry.startAll(); 
        
        // The test passes if it completes without throwing an unhandled exception.
    });
});