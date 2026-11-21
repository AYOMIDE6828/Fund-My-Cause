/**
 * Single-entry Horizon client guards (#1690). All callers that use
 * getOrCreateHorizonClient share one HorizonClient until it is reset.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HorizonClient, getOrCreateHorizonClient, resetHorizonClient } from "./horizon-client.js";

const config = { horizonUrl: "https://horizon-testnet.stellar.org" };

describe("getOrCreateHorizonClient (#1690)", () => {
  beforeEach(() => {
    resetHorizonClient();
  });

  it("returns a HorizonClient", () => {
    expect(getOrCreateHorizonClient(config)).toBeInstanceOf(HorizonClient);
  });

  it("returns the same instance to every caller", () => {
    const first = getOrCreateHorizonClient(config);
    const second = getOrCreateHorizonClient(config);

    expect(second).toBe(first);
  });

  it("creates a new instance after reset", () => {
    const first = getOrCreateHorizonClient(config);
    resetHorizonClient();

    expect(getOrCreateHorizonClient(config)).not.toBe(first);
  });
});
