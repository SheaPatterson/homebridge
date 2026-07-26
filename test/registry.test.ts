import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../packages/backend/src/core/event-bus.js";
import { AdapterRegistry, consoleLogger } from "../packages/backend/src/core/registry.js";
import { MockAdapter } from "../packages/backend/src/adapters/mock/index.js";

describe("AdapterRegistry", () => {
  let bus: EventBus;
  let registry: AdapterRegistry;
  let mock: MockAdapter;

  beforeEach(() => {
    bus = new EventBus();
    registry = new AdapterRegistry({ eventBus: bus, logger: consoleLogger });
    mock = new MockAdapter();
  });

  it("registers and starts an adapter", async () => {
    registry.register(mock);
    await registry.start(mock.id);
    const loaded = registry.get(mock.id);
    expect(loaded?.state).toBe("running");
  });

  it("reports adapter health", async () => {
    registry.register(mock);
    await registry.start(mock.id);
    const health = await registry.healthAll();
    expect(health).toHaveLength(1);
    expect(health[0].status).toBe("ok");
    expect(health[0].adapterId).toBe("mock");
  });

  it("isolates failures: a crashing adapter does not block others", async () => {
    class CrashingAdapter extends MockAdapter {
      override async start(): Promise<void> {
        throw new Error("boom");
      }
    }
    registry.register(new CrashingAdapter());
    registry.register(mock);
    await registry.startAll();
    expect(registry.get("mock")?.state).toBe("running");
    expect(registry.get("crashing")?.state).toBe("failed");
  });

  it("refuses to start an unknown adapter", async () => {
    await expect(registry.start("nope")).rejects.toThrow(/not registered/);
  });

  it("stops a running adapter", async () => {
    registry.register(mock);
    await registry.start(mock.id);
    await registry.stop(mock.id);
    expect(registry.get(mock.id)?.state).toBe("stopped");
  });

  it("delegates setState only when running", async () => {
    registry.register(mock);
    await expect(registry.setState("mock", "mock:light-1", { kind: "set_on", on: true })).rejects.toThrow(
      /not running/,
    );
  });

  it("emits adapter events to subscribers", async () => {
    registry.register(mock);
    await registry.start(mock.id);
    const seen: string[] = [];
    registry.onAdapterEvent("mock", (e) => {
      if (e.type === "device_state_changed") seen.push(e.deviceId);
    });
    await registry.setState("mock", "mock:light-1", { kind: "set_on", on: true });
    expect(seen).toContain("mock:light-1");
  });
});
