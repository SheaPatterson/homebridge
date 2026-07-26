import { describe, it, expect, beforeEach } from "vitest";
import { MockAdapter } from "../packages/backend/src/adapters/mock/index.js";
import { EventBus } from "../packages/backend/src/core/event-bus.js";
import { AdapterRegistry, consoleLogger } from "../packages/backend/src/core/registry.js";

describe("MockAdapter", () => {
  let adapter: MockAdapter;
  let bus: EventBus;
  let registry: AdapterRegistry;

  beforeEach(() => {
    adapter = new MockAdapter();
    bus = new EventBus();
    registry = new AdapterRegistry({ eventBus: bus, logger: consoleLogger });
  });

  it("has stable identity", () => {
    expect(adapter.id).toBe("mock");
    expect(adapter.displayName).toMatch(/Mock/i);
    expect(adapter.version).toMatch(/\d+\.\d+\.\d+/);
  });

  it("yields two demo devices during discovery", async () => {
    registry.register(adapter);
    await registry.start("mock");
    const iter = registry.startDiscovery("mock");
    const found: string[] = [];
    for await (const d of iter) found.push(d.protocolId);
    expect(found).toContain("mock:light-1");
    expect(found).toContain("mock:sensor-1");
  });

  it("supports pairing with a terminal success step", async () => {
    registry.register(adapter);
    await registry.start("mock");
    const iter = registry.beginPairing("mock", {});
    const steps: string[] = [];
    let terminal = false;
    for await (const s of iter) {
      steps.push(s.id);
      if (s.terminal) terminal = s.terminal.status === "success";
    }
    expect(steps).toContain("searching");
    expect(steps).toContain("found");
    expect(steps).toContain("done");
    expect(terminal).toBe(true);
  });

  it("flips state on setState and broadcasts an event", async () => {
    registry.register(adapter);
    await registry.start("mock");
    const seen: string[] = [];
    registry.onAdapterEvent("mock", (e) => {
      if (e.type === "device_state_changed") seen.push(e.deviceId);
    });
    await registry.setState("mock", "mock:light-1", { kind: "set_on", on: true });
    expect(seen).toEqual(["mock:light-1"]);
  });

  it("rejects unknown device ids", async () => {
    registry.register(adapter);
    await registry.start("mock");
    await expect(registry.setState("mock", "nope", { kind: "set_on", on: true })).rejects.toThrow(
      /Unknown device/,
    );
  });

  it("returns ok health", async () => {
    const h = await adapter.health();
    expect(h.status).toBe("ok");
  });
});