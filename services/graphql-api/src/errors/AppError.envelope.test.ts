/**
 * Response-envelope guards for AppError (#1693). Clients rely on the code,
 * the HTTP status in extensions, and the optional details block.
 */

import { describe, it, expect } from "vitest";
import { AppError } from "./AppError.js";

describe("AppError response envelope (#1693)", () => {
  it("carries the code and HTTP status in extensions", () => {
    const err = new AppError("Campaign not found", { code: "NOT_FOUND" });

    expect(err.message).toBe("Campaign not found");
    expect(err.extensions.code).toBe("NOT_FOUND");
    expect(err.extensions.http).toEqual({ status: 404 });
  });

  it("maps rate-limit errors to 429", () => {
    const err = new AppError("Too many requests", { code: "TOO_MANY_REQUESTS" });

    expect(err.extensions.http).toEqual({ status: 429 });
  });

  it("forwards details only when they are given", () => {
    const withDetails = new AppError("Bad input", {
      code: "BAD_USER_INPUT",
      details: { field: "goal" },
    });
    const without = new AppError("Bad input", { code: "BAD_USER_INPUT" });

    expect(withDetails.extensions.details).toEqual({ field: "goal" });
    expect(without.extensions).not.toHaveProperty("details");
  });
});
