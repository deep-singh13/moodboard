import { describe, it, expect, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 10, 20, 0];
    const results = await mapWithConcurrency(delays, 4, (ms) => {
      return new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms));
    });
    expect(results).toEqual(delays);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return i;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles an empty input without dividing by zero on the worker count", async () => {
    const fn = vi.fn();
    const results = await mapWithConcurrency([], 4, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("caps worker count at the item count when limit exceeds it", async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const results = await mapWithConcurrency([1, 2], 10, fn);
    expect(results).toEqual([2, 4]);
  });

  it("propagates a rejection from the mapped function", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
