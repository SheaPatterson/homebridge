// src/core/types.ts

import { z } from 'zod';

/**
 * --- Core Domain Types ---
 */

export interface HealthResponse {
  status: "ok";
  timestamp: number;
}

export interface DeviceState {
  id: string;
  name: string;
  type: string; // e.g., 'light', 'thermostat'
  isOn: boolean;
  brightness?: number;
  temperature?: number;
  lastUpdated: number;
}

/**
 * Global state structure for the entire smart home system.
 */
export interface AppState {
    healthStatus: HealthResponse | null;
    devices: Record<string, DeviceState>; // Keyed by device ID
    isLoading: boolean;
    error: string | null;
}

/**
 * --- Adapter Contract Types (The most important part) ---
 */

export interface PairingInput {
  protocolId: string;
  initialData?: any;
}

export interface PairingStep {
  stepName: string;
  description: string;
  actionRequired: 'user_input' | 'network_wait';
  // ... other step-specific data
}

export interface DeviceCommand {
  commandType: 'set_state' | 'query_status';
  payload: Record<string, any>; // e.g., { brightness: 50 }
}

export interface AdapterEvent {
    deviceId: string;
    eventType: 'state_change' | 'discovery' | 'error';
    data: Record<string, any>;
    timestamp: number;
}

export interface AdapterHealth {
  adapterId: string;
  status: "ok" | "degraded" | "down";
  lastCheck: number;
  message: string;
}

/**
 * Context passed to the adapter's lifecycle methods.
 */
export interface AdapterContext {
    // Placeholder for services that adapters need access to (e.g., logger, event emitter)
    eventBus: EventEmitter; 
    dbClient: any; // Will be better-sqlite3 instance
}

/**
 * The core contract every protocol adapter must implement.
 */
export interface DeviceAdapter {
  readonly id: string;                        // e.g., 'zigbee', 'matter'
  readonly displayName: string;
  readonly version: string;

  // Lifecycle
  start(ctx: AdapterContext): Promise<void>;
  stop(): Promise<void>;

  // Discovery & Pairing
  startDiscovery(): AsyncIterable<DiscoveredDevice>;
  stopDiscovery(): Promise<void>;
  beginPairing(input: PairingInput): AsyncIterable<PairingStep>;
  abortPairing(): Promise<void>;

  // Runtime Control
  setState(deviceId: string, command: DeviceCommand): Promise<void>;
  onEvent(handler: (e: AdapterEvent) => void): Unsubscribe; // Returns a cleanup function

  // Health Check
  health(): Promise<AdapterHealth>;
}

export interface DiscoveredDevice {
    id: string;
    name: string;
    protocol: string;
    type: string;
    lastSeen: number;
}

/**
 * Utility for event handling.
 */
class EventEmitter {
    private listeners: Map<string, Set<(e: any) => void>> = new Map();

    on(event: string, listener: (e: any) => void): Unsubscribe {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const set = this.listeners.get(event)!;
        set.add(listener);

        return () => {
            set.delete(listener);
            if (set.size === 0) {
                this.listeners.delete(event);
            }
        };
    }

    emit(event: string, data: any): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(data));
        }
    }
}

export type Unsubscribe = () => void;