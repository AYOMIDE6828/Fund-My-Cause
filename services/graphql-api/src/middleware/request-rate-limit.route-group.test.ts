/**
 * Per-route-group rate-limit guards (#1691). A busy group must not consume
 * the budget of another group for the same client.
 */

import { describe, it, expect } from "vitest";
import { RequestRateLimiter } from "./request-rate-limit.js";
import type { RateLimitConfig } from "../config/rate-limit-config.js";

const config: RateLimitConfig = {
  enabled: true,
  windowMs: 60_000,
  maxRequestsPerIp: 100,
  maxRequestsPerApiKey: 100,
  trustProxy: false,
};

describe("RequestRateLimiter route groups (#1691)", () => {
  it("blocks a group once its limit is reached", () => {
    const limiter = new RequestRateLimiter(config);

    expect(limiter.checkRouteGroup("mutations", "1.2.3.4", 2).allowed).toBe(true);
    expect(limiter.checkRouteGroup("mutations", "1.2.3.4", 2).allowed).toBe(true);

    const blocked = limiter.checkRouteGroup("mutations", "1.2.3.4", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate budgets for separate groups", () => {
    const limiter = new RequestRateLimiter(config);

    limiter.checkRouteGroup("mutations", "1.2.3.4", 1);

    expect(limiter.checkRouteGroup("mutations", "1.2.3.4", 1).allowed).toBe(false);
    expect(limiter.checkRouteGroup("queries", "1.2.3.4", 1).allowed).toBe(true);
  });

  it("keeps separate budgets per client IP within a group", () => {
    const limiter = new RequestRateLimiter(config);

    limiter.checkRouteGroup("mutations", "1.2.3.4", 1);

    expect(limiter.checkRouteGroup("mutations", "5.6.7.8", 1).allowed).toBe(true);
  });
});
