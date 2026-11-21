/**
 * Environment loading guards (#1688). Defaults apply when a variable is
 * unset, and a malformed number fails with the variable name in the message.
 */

import { describe, it, expect } from "vitest";
import { readEnv } from "./env.js";

describe("readEnv (#1688)", () => {
  it("applies defaults when nothing is set", () => {
    const env = readEnv({});

    expect(env.port).toBe(4000);
    expect(env.queryCostMax).toBe(1000);
    expect(env.queryDepthMax).toBe(15);
    expect(env.corsOrigins).toBeUndefined();
  });

  it("parses numeric overrides", () => {
    const env = readEnv({ GRAPHQL_PORT: "5001", GRAPHQL_QUERY_COST_MAX: "250" });

    expect(env.port).toBe(5001);
    expect(env.queryCostMax).toBe(250);
  });

  it("names the variable when a numeric value is malformed", () => {
    expect(() => readEnv({ GRAPHQL_PORT: "abc" })).toThrow(/GRAPHQL_PORT/);
  });

  it("rejects negative and fractional numbers", () => {
    expect(() => readEnv({ GRAPHQL_QUERY_DEPTH_MAX: "-1" })).toThrow(/GRAPHQL_QUERY_DEPTH_MAX/);
    expect(() => readEnv({ GRAPHQL_QUERY_COST_MAX: "1.5" })).toThrow(/GRAPHQL_QUERY_COST_MAX/);
  });

  it("splits CORS_ORIGIN into a list", () => {
    const env = readEnv({ CORS_ORIGIN: "https://a.test,https://b.test" });

    expect(env.corsOrigins).toEqual(["https://a.test", "https://b.test"]);
  });
});
