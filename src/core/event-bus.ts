// src/core/event-bus.ts

import { EventEmitter } from "./types";

/**
 * Centralized event bus for the entire application. 
 * All adapters and services should communicate through this single source of truth.
 */
export const eventBus = new EventEmitter();

/**
 * Helper function to emit a structured event.
 * @param eventType The type of event (e.g., 'device:state_change').
 * @param data The payload associated with the event.
 */
export function emitEvent(eventType: string, data: any): void {
    eventBus.emit(eventType, data);
}