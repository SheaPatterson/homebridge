import { describe, it, expect } from "vitest";
import { DeviceCommandSchema, RoomCreateSchema } from "../packages/backend/src/core/types.js";

describe("Zod schemas", () => {
  it("accepts a well-formed set_on command", () => {
    const parsed = DeviceCommandSchema.parse({ kind: "set_on", on: true });
    expect(parsed).toEqual({ kind: "set_on", on: true });
  });

  it("rejects a brightness out of range", () => {
    expect(() => DeviceCommandSchema.parse({ kind: "set_brightness", brightness: 150 })).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() => DeviceCommandSchema.parse({ kind: "set_volume", volume: 5 })).toThrow();
  });

  it("rejects an empty room name", () => {
    expect(() => RoomCreateSchema.parse({ name: "" })).toThrow();
  });
});
