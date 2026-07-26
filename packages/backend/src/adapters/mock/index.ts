/**
 * MockAdapter — protocol-agnostic fake used by tests and the in-app demo mode.
 *
 * It exposes two devices: a light and a sensor, supports discovery (which
 * yields them once), pairing (single-step, always succeeds), and
 * setState (in-memory only).
 */
import type {
  AdapterContext,
  AdapterEvent,
  AdapterHealth,
  DeviceAdapter,
  DeviceCommand,
  DeviceState,
  DiscoveredDevice,
  PairingInput,
  PairingStep,
  Unsubscribe,
} from "../core/types.js";
import { EventEmitter } from "node:events";

interface MockDevice {
  id: string;
  name: string;
  state: Record<string, unknown>;
}

export class MockAdapter implements DeviceAdapter {
  readonly id = "mock";
  readonly displayName = "Mock Adapter (Demo)";
  readonly version = "1.0.0";

  private ctx: AdapterContext | null = null;
  private devices: MockDevice[] = [
    { id: "mock:light-1", name: "Demo Lamp", state: { on: false, brightness: 80 } },
    { id: "mock:sensor-1", name: "Demo Motion Sensor", state: { motion: false, battery: 92 } },
  ];
  private emitter = new EventEmitter();
  private discovering = false;
  private pairing = false;

  async start(ctx: AdapterContext): Promise<void> {
    this.ctx = ctx;
    ctx.log.info("MockAdapter started");
  }

  async stop(): Promise<void> {
    this.emitter.removeAllListeners();
    this.ctx = null;
  }

  async *startDiscovery(): AsyncIterable<DiscoveredDevice> {
    this.discovering = true;
    try {
      // Yield one device per tick; let the consumer cancel between ticks.
      for (const d of this.devices) {
        if (!this.discovering) return;
        yield {
          protocolId: d.id,
          name: d.name,
          kind: d.id.includes("light") ? "light" : "sensor",
          capabilities: d.id.includes("light")
            ? ["on_off", "brightness"]
            : ["motion", "battery"],
          vendor: "MockCo",
          model: "M-1",
        };
        await sleep(10);
      }
    } finally {
      this.discovering = false;
    }
  }

  async stopDiscovery(): Promise<void> {
    this.discovering = false;
  }

  async *beginPairing(_input: PairingInput): AsyncIterable<PairingStep> {
    this.pairing = true;
    try {
      yield {
        id: "searching",
        title: "Searching for devices…",
        awaitingUserAction: false,
      };
      await sleep(50);
      if (!this.pairing) {
        yield { id: "aborted", title: "Pairing aborted", awaitingUserAction: false, terminal: { status: "aborted" } };
        return;
      }
      yield {
        id: "found",
        title: "Demo devices ready to pair",
        description: "This is a mock — no real pairing required.",
        awaitingUserAction: true,
      };
      await sleep(50);
      yield {
        id: "done",
        title: "Paired!",
        awaitingUserAction: false,
        terminal: { status: "success" },
      };
    } finally {
      this.pairing = false;
    }
  }

  async abortPairing(): Promise<void> {
    this.pairing = false;
  }

  async setState(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.find((d) => d.id === deviceId);
    if (!device) throw new Error(`Unknown device: ${deviceId}`);
    switch (command.kind) {
      case "set_on":
        device.state.on = command.on;
        break;
      case "set_brightness":
        device.state.brightness = command.brightness;
        break;
      case "set_temperature":
        device.state.temperature = command.temperature;
        break;
    }
    const event: AdapterEvent = {
      type: "device_state_changed",
      deviceId,
      state: { ...(device.state as DeviceState) },
    };
    this.emit(event);
  }

  onEvent(handler: (e: AdapterEvent) => void): Unsubscribe {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  async health(): Promise<AdapterHealth> {
    return { adapterId: this.id, status: "ok", message: "Mock adapter running" };
  }

  // Test helpers
  __forceEvent(event: AdapterEvent): void {
    this.emit(event);
  }

  private emit(event: AdapterEvent): void {
    this.emitter.emit("event", event);
    this.ctx?.emit(event);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
