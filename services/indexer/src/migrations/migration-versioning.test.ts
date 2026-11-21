/**
 * Versioned-schema guards for the indexer migration runner (#1687).
 * Migration ids must stay in the `NNN_name` form, and `up` must run the
 * migrations through the runner with the store it was given.
 */

import { describe, it, expect, vi } from "vitest";
import { migration001 } from "./001_add_event_indexes.js";
import { runMigrations } from "./run-migrations.js";

function fakeStore() {
  return {
    enableIndexes: vi.fn(),
    disableIndexes: vi.fn(),
    verifyIndexes: vi.fn(() => true),
  };
}

describe("migration versioning (#1687)", () => {
  it("uses a zero-padded numeric version prefix in the id", () => {
    expect(migration001.id).toMatch(/^\d{3}_[a-z_]+$/);
  });

  it("applies migrations with the store passed to the runner", () => {
    const store = fakeStore();

    runMigrations(store as never, "up");

    expect(store.enableIndexes).toHaveBeenCalledTimes(1);
  });

  it("rolls back through the same store on down", () => {
    const store = fakeStore();

    runMigrations(store as never, "down");

    expect(store.disableIndexes).toHaveBeenCalledTimes(1);
  });
});
