/**
 * AdapterRegistry — load, start, stop, and recover adapters.
 *
 * The registry is the boundary between the protocol-agnostic core and the
 * adapter implementations. Its two most important responsibilities:
 *
 *   1. **Fault isolation.** A crash in one adapter must never take down the
 *      others. Every `start()` runs in a guarded context that catches
 *      synchronous throws and rejected promises.
 *
 *   2. **Event routing.** All adapter events flow through the registry, which
 *      fans them out onto the in-process `EventBus` for domain services to
 *      consume.
 *
 * Phase 1 of the v2 plan.
 */
import type { EventEmitter } from "node:events";
import { EventEmitter as NodeEventEmitter } from "node:events";
import type {
  AdapterContext,
  AdapterEvent,
  AdapterHealth,
  Device,
  DeviceAdapter,
  DeviceCommand,
  PairingInput,
  PairingStep,
  Unsubscribe,
  DiscoveredDevice,
} from "./types.js";
import type { EventBus } from "./event-bus.js";

export interface RegistryLogger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface RegistryOptions {
  eventBus: EventBus;
  logger: RegistryLogger;
  /** Per-adapter settings (defaults to {}). */
  settings?: Record<string, Record<string, string | number | boolean>>;
}

export interface LoadedAdapter {
  adapter: DeviceAdapter;
  state: "registered" | "starting" | "running" | "stopped" | "failed";
  lastError?: string;
}

/**
 * Default console-backed logger so the registry is usable without DI.
 */
export const consoleLogger: RegistryLogger = {
  debug: (m) => console.debug(`[registry] ${m}`),
  info: (m) => console.info(`[registry] ${m}`),
  warn: (m) => console.warn(`[registry] ${m}`),
  error: (m) => console.error(`[registry] ${m}`),
};

export class AdapterRegistry {
  private readonly adapters = new Map<string, LoadedAdapter>();
  private readonly listeners = new Map<string, Set<(e: AdapterEvent) => void>>();
  private readonly settings: Record<string, Record<string, string | number | boolean>>;
  private readonly eventBus: EventBus;
  private readonly logger: RegistryLogger;
  /** Internal emitter used to fan out adapter events to per-id listeners. */
  private readonly fanout = new NodeEventEmitter();

  constructor(opts: RegistryOptions) {
    this.eventBus = opts.eventBus;
    this.logger = opts.logger;
    this.settings = opts.settings ?? {};
    this.fanout.setMaxListeners(1000);
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /** Register an adapter instance. Does not start it. */
  register(adapter: DeviceAdapter): void {
    if (this.adapters.has(adapter.id)) {
      this.logger.warn(`Adapter ${adapter.id} already registered — replacing.`);
      this.unregister(adapter.id);
    }
    this.adapters.set(adapter.id, { adapter, state: "registered" });
    this.logger.info(`Registered adapter: ${adapter.id} v${adapter.version}`);
  }

  /** Unregister an adapter (stops it first if running). */
  async unregister(id: string): Promise<void> {
    const loaded = this.adapters.get(id);
    if (!loaded) return;
    if (loaded.state === "running") {
      try {
        await loaded.adapter.stop();
      } catch (err) {
        this.logger.warn(`Adapter ${id} threw on stop(): ${(err as Error).message}`);
      }
    }
    this.adapters.delete(id);
    this.listeners.delete(id);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(id: string): Promise<void> {
    const loaded = this.require(id);
    loaded.state = "starting";
    const ctx = this.buildContext(loaded.adapter.id);
    try {
      await loaded.adapter.start(ctx);
      loaded.state = "running";
      loaded.lastError = undefined;
      this.logger.info(`Started adapter: ${id}`);
    } catch (err) {
      loaded.state = "failed";
      loaded.lastError = (err as Error).message;
      this.logger.error(`Adapter ${id} failed to start: ${loaded.lastError}`);
    }
  }

  async startAll(): Promise<void> {
    // Start in parallel; failures are isolated.
    await Promise.all(Array.from(this.adapters.keys()).map((id) => this.start(id)));
  }

  async stop(id: string): Promise<void> {
    const loaded = this.require(id);
    try {
      await loaded.adapter.stop();
      loaded.state = "stopped";
      this.logger.info(`Stopped adapter: ${id}`);
    } catch (err) {
      loaded.state = "failed";
      loaded.lastError = (err as Error).message;
      this.logger.error(`Adapter ${id} threw on stop(): ${loaded.lastError}`);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.adapters.keys()).map((id) => this.stop(id)));
  }

  // -------------------------------------------------------------------------
  // Adapter API delegation
  // -------------------------------------------------------------------------

  async setState(id: string, deviceId: string, command: DeviceCommand): Promise<void> {
    const loaded = this.require(id);
    if (loaded.state !== "running") {
      throw new Error(`Adapter ${id} is not running (state: ${loaded.state})`);
    }
    return loaded.adapter.setState(deviceId, command);
  }

  startDiscovery(id: string): AsyncIterable<DiscoveredDevice> {
    const loaded = this.require(id);
    if (loaded.state !== "running") {
      throw new Error(`Adapter ${id} is not running`);
    }
    return loaded.adapter.startDiscovery();
  }

  async stopDiscovery(id: string): Promise<void> {
    const loaded = this.require(id);
    if (loaded.state !== "running") return;
    return loaded.adapter.stopDiscovery();
  }

  beginPairing(id: string, input: PairingInput): AsyncIterable<PairingStep> {
    const loaded = this.require(id);
    if (loaded.state !== "running") {
      throw new Error(`Adapter ${id} is not running`);
    }
    return loaded.adapter.beginPairing(input);
  }

  async abortPairing(id: string): Promise<void> {
    const loaded = this.require(id);
    if (loaded.state !== "running") return;
    return loaded.adapter.abortPairing();
  }

  // -------------------------------------------------------------------------
  // Event subscription
  // -------------------------------------------------------------------------

  onAdapterEvent(id: string, handler: (e: AdapterEvent) => void): Unsubscribe {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Health & introspection
  // -------------------------------------------------------------------------

  list(): LoadedAdapter[] {
    return Array.from(this.adapters.values());
  }

  listIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  get(id: string): LoadedAdapter | undefined {
    return this.adapters.get(id);
  }

  async healthAll(): Promise<AdapterHealth[]> {
    const results: AdapterHealth[] = [];
    for (const [id, loaded] of this.adapters) {
      if (loaded.state !== "running") {
        results.push({
          adapterId: id,
          status: loaded.state === "failed" ? "down" : "starting",
          message: loaded.lastError,
        });
        continue;
      }
      try {
        const h = await loaded.adapter.health();
        results.push({ ...h, adapterId: h.adapterId || id });
      } catch (err) {
        results.push({
          adapterId: id,
          status: "down",
          message: (err as Error).message,
        });
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private require(id: string): LoadedAdapter {
    const loaded = this.adapters.get(id);
    if (!loaded) throw new Error(`Adapter ${id} is not registered`);
    return loaded;
  }

  private buildContext(adapterId: string): AdapterContext {
    const settings = this.settings[adapterId] ?? {};
    return {
      settings,
      log: {
        debug: (m) => this.logger.debug(`[${adapterId}] ${m}`),
        info: (m) => this.logger.info(`[${adapterId}] ${m}`),
        warn: (m) => this.logger.warn(`[${adapterId}] ${m}`),
        error: (m) => this.logger.error(`[${adapterId}] ${m}`),
      },
      emit: (e) => {
        this.eventBus.emit({ type: "adapter_event", event: e });
        const set = this.listeners.get(adapterId);
        if (set) for (const handler of set) handler(e);
        this.fanout.emit(adapterId, e);
      },
    };
  }
}