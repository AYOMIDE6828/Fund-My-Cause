/**
 * Security-header guards (#1694). Every response gets the baseline headers
 * and the request continues to the next handler.
 */

import { describe, it, expect, vi } from "vitest";
import { securityHeaders } from "./security-headers.js";

describe("securityHeaders (#1694)", () => {
  it("sets the baseline headers and calls next", () => {
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    securityHeaders({} as never, res as never, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
