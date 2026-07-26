// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { AdapterRegistry } from '@/core/adapter-registry';
import { MockAdapter } from '@/adapters/mock';
import { AdapterContext } from '@/core/types';
import { initializeDatabase, runMigrations } from '@/core/persistence/sqlite';

// Initialize core services globally for the API route context
const db = initializeDatabase();
runMigrations(db); // Ensure schema exists on startup

const mockAdapterInstance = new MockAdapter({ eventBus: null as any, dbClient: db }); 
const registry = new AdapterRegistry({ eventBus: null as any, dbClient: db });

// Manually register the mock adapter for this API endpoint demonstration
registry.register(mockAdapterInstance);


export async function GET() {
    try {
        await registry.startAll(); // Start all adapters and discovery processes

        const healthChecks = [];
        for (const adapter of registry.getAllAdapters().values()) {
            try {
                const health = await adapter.health();
                healthChecks.push(health);
            } catch (e) {
                console.error(`Failed to get health for ${adapter.id}:`, e);
                healthChecks.push({ 
                    adapterId: adapter.id, 
                    status: "down", 
                    lastCheck: Date.now(), 
                    message: `Error checking status: ${(e as Error).message}` 
                });
            }
        }

        return NextResponse.json({
            status: 'ok',
            timestamp: Date.now(),
            adapters: healthChecks,
        });

    } catch (error) {
        console.error("Error generating system health report:", error);
        return NextResponse.json({ 
            status: 'error', 
            message: 'Failed to retrieve system health status.',
            details: (error as Error).message
        }, { status: 500 });
    } finally {
        // Clean up resources if necessary, though in a real Next.js environment this might be handled by the runtime.
        await registry.stopAll();
    }
}