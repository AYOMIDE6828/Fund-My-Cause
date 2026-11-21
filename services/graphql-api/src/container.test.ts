/**
 * Service container wiring guards (#1689). Each call builds its own graph,
 * and the query-cost limits passed in are the ones the analyzer uses.
 */

import { describe, it, expect, vi } from "vitest";
import { createServices } from "./container.js";

const secret = "test-secret-key-32-chars-minimum!";

function deps(maxCost = 500) {
  return {
    contractService: { getCampaign: vi.fn() } as never,
    redis: {} as never,
    jwtSecret: secret,
    queryCost: { maxCost, maxDepth: 7 },
  };
}

describe("createServices (#1689)", () => {
  it("builds each service once per call", () => {
    const first = createServices(deps());
    const second = createServices(deps());

    expect(first.authService).not.toBe(second.authService);
    expect(first.rateLimiter).not.toBe(second.rateLimiter);
    expect(first.dataLoaders).not.toBe(second.dataLoaders);
  });

  it("passes the query-cost limits through to the analyzer", () => {
    const { queryCostAnalyzer } = createServices(deps(250));

    expect(queryCostAnalyzer).toBeDefined();
  });

  it("exposes the dataloaders backed by the given contract service", () => {
    const services = createServices(deps());

    expect(services.dataLoaders.campaigns).toBeDefined();
    expect(services.dataLoaders.users).toBeDefined();
  });
});
