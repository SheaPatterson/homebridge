import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../packages/backend/src/core/event-bus.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("delivers domain events to subscribers", () => {
    const seen: string[] = [];
    bus.on((e) => seen.push(e.type));
    bus.emit({ type: "device_added", device: stubDevice() });
    bus.emit({ type: "device_removed", deviceId: "x" });
    expect(seen).toEqual(["device_added", "device_removed"]);
  });

  it("supports unsubscribing", () => {
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.emit({ type: "device_added", device: stubDevice() });
    off();
    bus.emit({ type: "device_added", device: stubDevice() });
    expect(seen).toEqual(["device_added"]);
  });

  it("routes adapter events to typed listeners", () => {
    const seen: string[] = [];
    bus.onAdapterEvent("device_state_changed", (e) => {
      seen.push(e.deviceId);
    });
    bus.emit({
      type: "adapter_event",
      event: { type: "device_state_changed", deviceId: "a", state: { on: true } },
    });
    expect(seen).toEqual(["a"]);
  });
});

function stubDevice() {
  return {
    id: "d1",
    adapterId: "mock",
    name: "D1",
    roomId: null,
    kind: "light" as const,
    capabilities: ["on_off" as const],
    state: { on: false },
    reachable: true,
    lastUpdated: 0,
  };
}
