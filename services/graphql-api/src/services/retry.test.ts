/**
 * Retry/backoff guards for external calls (#1698).
 */

import { describe, it, expect, vi } from "vitest";
import { backoffDelay, withBackoff } from "./retry.js";

describe("backoffDelay (#1698)", () => {
  it("doubles the delay on each attempt", () => {
    const opts = { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 1 };

    expect(backoffDelay(0, opts)).toBe(100);
    expect(backoffDelay(1, opts)).toBe(200);
    expect(backoffDelay(2, opts)).toBe(400);
  });

  it("never exceeds the cap", () => {
    expect(backoffDelay(20, { baseDelayMs: 100, maxDelayMs: 500, random: () => 1 })).toBe(500);
  });

  it("applies jitter within [0, exponential delay)", () => {
    expect(backoffDelay(1, { baseDelayMs: 100, maxDelayMs: 10_000, random: () => 0.5 })).toBe(100);
  });
});

describe("withBackoff (#1698)", () => {
  const opts = {
    attempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 100,
    random: () => 1,
  };

  it("returns the first successful result", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const sleep = vi.fn();

    await expect(withBackoff(fn, { ...opts, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries until a later attempt succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withBackoff(fn, { ...opts, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("rethrows the last error after the attempts run out", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withBackoff(fn, { ...opts, sleep })).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-positive attempt count", async () => {
    await expect(withBackoff(async () => 1, { ...opts, attempts: 0 })).rejects.toThrow(RangeError);
  });
});
