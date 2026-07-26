/**
 * The Hub — the single in-process object that owns the whole core.
 *
 * Phase 1: bus + registry + persistence + mock adapter.
 * Phase 2: + repositories + DeviceRegistry + RoomService + Mutex.
 */
import { AdapterRegistry, type RegistryLogger } from "./registry.js";
import { EventBus } from "./event-bus.js";
import { createPersistence, type Persistence } from "./persistence/sqlite.js";
import { runMigrations } from "./persistence/migrations.js";
import { Mutex } from "./mutex.js";
import { DeviceRepository } from "./repositories/devices.js";
import { RoomRepository } from "./repositories/rooms.js";
import { DeviceRegistry } from "./device-registry.js";
import { RoomService } from "./room-service.js";
import { MockAdapter } from "../adapters/mock/index.js";

export interface HubOptions {
  persistencePath?: string;
  logger?: RegistryLogger;
  /** Adapters to register at construction. Defaults to [MockAdapter]. */
  adapters?: Array<new () => unknown>;
  /** If true (default), call `startAll()` after registration. */
  autoStart?: boolean;
}

export class Hub {
  readonly bus: EventBus;
  readonly registry: AdapterRegistry;
  readonly persistence: Persistence;
  readonly mutex: Mutex;
  readonly devices: DeviceRepository;
  readonly rooms: RoomRepository;
  readonly deviceRegistry: DeviceRegistry;
  readonly roomService: RoomService;
  readonly logger: RegistryLogger;
  private readonly autoStart: boolean;
  private started = false;
  private persistencePath: string;

  constructor(opts: HubOptions = {}) {
    this.logger = opts.logger ?? defaultLogger;
    this.bus = new EventBus();
    this.registry = new AdapterRegistry({ eventBus: this.bus, logger: this.logger });
    this.mutex = new Mutex();
    this.persistence = null as unknown as Persistence; // assigned in init()
    this.devices = null as unknown as DeviceRepository;
    this.rooms = null as unknown as RoomRepository;
    this.deviceRegistry = null as unknown as DeviceRegistry;
    this.roomService = null as unknown as RoomService;
    this.autoStart = opts.autoStart ?? true;
    this.persistencePath = opts.persistencePath ?? ":memory:";
  }

  /** Async init — must be awaited before use. */
  async init(): Promise<void> {
    this.persistence = await createPersistence({ path: this.persistencePath });
    await runMigrations(this.persistence);
    this.devices = new DeviceRepository(this.persistence);
    this.rooms = new RoomRepository(this.persistence);
    this.deviceRegistry = new DeviceRegistry(this.bus, this.registry, this.devices, this.rooms);
    this.roomService = new RoomService(this.bus, this.rooms);
    this.installDefaultAdapters();
    await this.deviceRegistry.hydrate();
    if (this.autoStart) {
      await this.registry.startAll();
      this.started = true;
    }
  }

  /** Idempotent. Safe to call multiple times. */
  async dispose(): Promise<void> {
    await this.registry.stopAll();
    await this.persistence.close();
  }

  isStarted(): boolean {
    return this.started;
  }

  private installDefaultAdapters(): void {
    this.registry.register(new MockAdapter());
  }
}

const defaultLogger: RegistryLogger = {
  debug: (m) => console.debug(`[hub] ${m}`),
  info: (m) => console.info(`[hub] ${m}`),
  warn: (m) => console.warn(`[hub] ${m}`),
  error: (m) => console.error(`[hub] ${m}`),
};
