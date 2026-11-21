/**
 * Typed null-guard for service reads (#1697). The NOT_FOUND message and code
 * match what the campaign resolver returned before this helper existed.
 */

import { describe, it, expect } from "vitest";
import { requireRecord } from "./require-record.js";

describe("requireRecord (#1697)", () => {
  it("returns the value unchanged when present", () => {
    expect(requireRecord({ id: "c1" }, "Campaign", "c1")).toEqual({ id: "c1" });
  });

  it("keeps falsy but defined values", () => {
    expect(requireRecord(0, "Count", "x")).toBe(0);
    expect(requireRecord("", "Name", "x")).toBe("");
  });

  it.each([null, undefined])("throws NOT_FOUND for %s", (missing) => {
    expect(() => requireRecord(missing, "Campaign", "c9")).toThrow("Campaign not found: c9");

    try {
      requireRecord(missing, "Campaign", "c9");
    } catch (err) {
      expect((err as { extensions: { code: string } }).extensions.code).toBe("NOT_FOUND");
    }
  });
});
