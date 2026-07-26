import { describe, it, expect } from "vitest";
import { Mutex } from "../packages/backend/src/core/mutex.js";

describe("Mutex", () => {
  it("serialises concurrent work", async () => {
    const m = new Mutex();
    const order: number[] = [];
    await Promise.all([
      m.run(async () => {
        await tick(20);
        order.push(1);
      }),
      m.run(async () => {
        await tick(5);
        order.push(2);
      }),
      m.run(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("continues after an error", async () => {
    const m = new Mutex();
    await expect(
      m.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const v = await m.run(async () => 42);
    expect(v).toBe(42);
  });
});

function tick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
