import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { everyMinute, untilNextMinute } from "../src/minutes.js";

/* The board hangs on a wall for months, so its minute loop is counted over
   minutes rather than looked at once: one run per boundary, however the run
   went, and nothing left running once it is stopped. */
describe("the minute loop", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-01T09:30:12")); });
  afterEach(() => { vi.useRealTimers(); });

  it("runs at once and then on every minute boundary, once each", async () => {
    const run = vi.fn();
    const stop = everyMinute(run);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(48_020);
    expect(run).toHaveBeenCalledTimes(2);
    expect(new Date().getSeconds()).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(run).toHaveBeenCalledTimes(7);
    stop();
  });

  it("keeps going after a run that failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValueOnce(new Error("store went away")).mockResolvedValue(undefined);
    const stop = everyMinute(run);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(run).toHaveBeenCalledTimes(4);
    expect(error).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops when it is told to, and leaves no timer behind", async () => {
    const run = vi.fn();
    const stop = everyMinute(run);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aims a hair past the next boundary", () => {
    expect(untilNextMinute(new Date("2026-09-01T09:30:12.500"))).toBe(47_520);
    expect(untilNextMinute(new Date("2026-09-01T09:30:59.990"))).toBe(30);
  });
});
