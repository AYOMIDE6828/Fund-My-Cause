/**
 * Page-size guards for the shared cursor helper (#1692). Every paginated
 * resolver goes through normalizePageSize, so its bounds are pinned here.
 */

import { describe, it, expect } from "vitest";
import { normalizePageSize } from "./cursor.js";

describe("normalizePageSize (#1692)", () => {
  it("keeps a requested size that is within bounds", () => {
    expect(normalizePageSize({ first: 5 })).toBe(5);
  });

  it("uses the last argument when first is absent", () => {
    expect(normalizePageSize({ last: 7 })).toBe(7);
  });

  it("caps very large requests", () => {
    expect(normalizePageSize({ first: 1_000_000 })).toBeLessThan(1_000_000);
  });

  it("rejects a zero or negative size", () => {
    expect(() => normalizePageSize({ first: 0 })).toThrow("Page size must be greater than 0");
    expect(() => normalizePageSize({ first: -3 })).toThrow("Page size must be greater than 0");
  });
});
