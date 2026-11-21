/**
 * Shutdown timeout guards (#1695). A hung shutdown must end in a forced
 * exit with a non-zero code, and a clean shutdown must not be forced.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { armForcedExit, SHUTDOWN_TIMEOUT_MS } from "./shutdown.js";

describe("armForcedExit (#1695)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exits with code 1 once the timeout elapses", () => {
    vi.useFakeTimers();
    const exit = vi.fn();

    armForcedExit(1_000, exit);
    vi.advanceTimersByTime(999);
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("can be cleared when shutdown finishes first", () => {
    vi.useFakeTimers();
    const exit = vi.fn();

    const timer = armForcedExit(1_000, exit);
    clearTimeout(timer);
    vi.advanceTimersByTime(5_000);

    expect(exit).not.toHaveBeenCalled();
  });

  it("uses a timeout of at least five seconds by default", () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });
});
