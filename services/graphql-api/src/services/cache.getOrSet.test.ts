/**
 * Read-through cache guards (#1700). A hit returns the stored value without
 * calling the loader, and a miss loads once and stores with the given TTL.
 */

import { describe, it, expect, vi } from "vitest";
import { CacheService } from "./cache.js";

function fakeRedis(stored: string | null) {
  return {
    get: vi.fn().mockResolvedValue(stored),
    setEx: vi.fn().mockResolvedValue("OK"),
  };
}

describe("CacheService.getOrSet (#1700)", () => {
  it("returns the cached value without calling the loader on a hit", async () => {
    const redis = fakeRedis(JSON.stringify({ title: "cached" }));
    const load = vi.fn();
    const cache = new CacheService(redis as never);

    await expect(cache.getOrSet("campaign:c1", 60, load)).resolves.toEqual({ title: "cached" });
    expect(load).not.toHaveBeenCalled();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it("loads and stores the value with the TTL on a miss", async () => {
    const redis = fakeRedis(null);
    const cache = new CacheService(redis as never);

    const value = await cache.getOrSet("campaign:c2", 300, async () => ({ title: "fresh" }));

    expect(value).toEqual({ title: "fresh" });
    expect(redis.setEx).toHaveBeenCalledWith("campaign:c2", 300, JSON.stringify({ title: "fresh" }));
  });
});
