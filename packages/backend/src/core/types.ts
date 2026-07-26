/**
 * Smart Home Hub — Core Domain Types
 * ------------------------------------------------------------------
 * These types are the single source of truth for the entire system.
 * Both the Express backend and the React frontend consume them (via
 * `packages/shared` re-exports) and every API route validates inputs
 * against them using Zod (see `./schemas.ts`).
 *
 * Phase 1 of the v2 plan locks these types down before any feature
 * work begins. The most important of these is the `DeviceAdapter`
 * interface — it is the contract a new protocol must implement to
 * ship in one PR without touching the core.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Adapter contract — the heart of the pluggable protocol surface
// ---------------------------------------------------------------------------

/** Capability a device exposes. Multiple capabilities per device are allowed. */
export type DeviceCapability =
  | "on_off"
  | "brightness"
  | "temperature"
  | "humidity"
  | "contact"
  | "motion"
  | "battery";

/** A device as the system sees it — protocol-agnostic. */
export interface Device {
  /** Globally unique device id. Format: `<adapterId>:<protocolId>`. */
  id: string;
  /** Adapter that owns this device. */
  adapterId: string;
  /** Human-readable name reported by the adapter. */
  name: string;
  /** Optional room id (FK to rooms). */
  roomId: string | null;
  /** Device type — see `DeviceKind`. */
  kind: DeviceKind;
  /** Capabilities the UI should render controls for. */
  capabilities: DeviceCapability[];
  /** Current desired state (last set by user or adapter). */
  state: DeviceState;
  /** True if the adapter reports the device as reachable. */
  reachable: boolean;
  /** Last time the state changed (ms epoch). */
  lastUpdated: number;
}

/** Coarse device kind used by the UI to pick a card variant. */
export type DeviceKind =
  | "light"
  | "switch"
  | "thermostat"
  | "sensor"
  | "contact"
  | "unknown";

/** Generic state. Each capability is optional and only meaningful if the
 * device advertises that capability. */
export interface DeviceState {
  on?: boolean;
  brightness?: number; // 0–100
  temperature?: number; // °C
  humidity?: number; // %
  contact?: "open" | "closed";
  motion?: boolean;
  battery?: number; // 0–100
}

/** A device as reported by the adapter during discovery (not yet paired). */
export interface DiscoveredDevice {
  protocolId: string;
  name: string;
  kind: DeviceKind;
  capabilities: DeviceCapability[];
  signalStrength?: number; // dBm or %
  vendor?: string;
  model?: string;
}

/** A step in an adapter's pairing flow. The UI renders the wizard from this
 * stream. */
export interface PairingStep {
  /** Logical step key — the wizard uses it to advance. */
  id: string;
  /** User-facing title. */
  title: string;
  /** User-facing description / instructions. */
  description?: string;
  /** True if the adapter is waiting for user input (e.g. button press). */
  awaitingUserAction: boolean;
  /** Terminal step — pairing done or aborted. */
  terminal?: { status: "success" | "error" | "aborted"; error?: string };
}

export interface PairingInput {
  /** Selected discovered device (if the adapter supports selective pairing). */
  protocolId?: string;
  /** User-supplied settings (e.g. install code for Matter). */
  settings?: Record<string, string | number | boolean>;
}

/** A command the core sends to the adapter. Adapters validate. */
export type DeviceCommand =
  | { kind: "set_on"; on: boolean }
  | { kind: "set_brightness"; brightness: number }
  | { kind: "set_temperature"; temperature: number };

/** Event emitted by an adapter to the core. */
export type AdapterEvent =
  | { type: "device_state_changed"; deviceId: string; state: DeviceState }
  | { type: "device_added"; device: Device }
  | { type: "device_removed"; deviceId: string }
  | { type: "device_unreachable"; deviceId: string }
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string };

/** Health snapshot an adapter can return at any time. */
export interface AdapterHealth {
  adapterId: string;
  status: "ok" | "degraded" | "down" | "starting";
  message?: string;
  details?: Record<string, string | number | boolean>;
}

/** Context provided to an adapter on `start()`. */
export interface AdapterContext {
  /** Emits an event into the core event bus. */
  emit: (e: AdapterEvent) => void;
  /** Per-adapter settings (from the DB). */
  settings: Record<string, string | number | boolean>;
  /** Logger. */
  log: { debug: (msg: string) => void; info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

/** Unsubscribe handle for event handlers. */
export type Unsubscribe = () => void;

/** The contract every adapter must implement. */
export interface DeviceAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;

  start(ctx: AdapterContext): Promise<void>;
  stop(): Promise<void>;

  startDiscovery(): AsyncIterable<DiscoveredDevice>;
  stopDiscovery(): Promise<void>;

  beginPairing(input: PairingInput): AsyncIterable<PairingStep>;
  abortPairing(): Promise<void>;

  setState(deviceId: string, command: DeviceCommand): Promise<void>;
  onEvent(handler: (e: AdapterEvent) => void): Unsubscribe;

  health(): Promise<AdapterHealth>;
}

// ---------------------------------------------------------------------------
// Rooms & scenes
// ---------------------------------------------------------------------------

export interface Room {
  id: string;
  name: string;
  /** Sort order — lower numbers first. */
  order: number;
}

export interface Scene {
  id: string;
  name: string;
  /** Devices and their desired states. */
  deviceStates: Record<string, DeviceState>;
}

// ---------------------------------------------------------------------------
// Health response returned by GET /api/health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: number;
  adapters: AdapterHealth[];
  uptime: number;
}

// ---------------------------------------------------------------------------
// Zod schemas — runtime validation at every API boundary
// ---------------------------------------------------------------------------

export const DeviceCommandSchema: z.ZodType<DeviceCommand> = z.union([
  z.object({ kind: z.literal("set_on"), on: z.boolean() }),
  z.object({ kind: z.literal("set_brightness"), brightness: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("set_temperature"), temperature: z.number() }),
]);

export const RoomCreateSchema = z.object({
  name: z.string().min(1).max(64),
  order: z.number().int().min(0).optional(),
});

export const RoomUpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  order: z.number().int().min(0).optional(),
});

export const AssignDeviceSchema = z.object({
  deviceId: z.string().min(1),
});

export const PairingInputSchema = z.object({
  protocolId: z.string().optional(),
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
