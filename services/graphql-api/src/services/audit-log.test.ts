/**
 * Audit log guards (#1701). Entries keep actor, action, target and time, and
 * a caller cannot change stored history through the returned objects.
 */

import { describe, it, expect } from "vitest";
import { AuditLog } from "./audit-log.js";

const fixedNow = () => new Date("2026-01-02T03:04:05.000Z");

describe("AuditLog (#1701)", () => {
  it("records actor, action, target and a timestamp", () => {
    const log = new AuditLog(fixedNow);

    const entry = log.record("GABC", "campaign.update", "c1");

    expect(entry).toEqual({
      actor: "GABC",
      action: "campaign.update",
      target: "c1",
      at: "2026-01-02T03:04:05.000Z",
    });
  });

  it("rejects an entry with no actor or action", () => {
    const log = new AuditLog(fixedNow);

    expect(() => log.record("", "campaign.update", "c1")).toThrow();
    expect(() => log.record("GABC", "", "c1")).toThrow();
  });

  it("filters by actor and by action", () => {
    const log = new AuditLog(fixedNow);
    log.record("GABC", "campaign.update", "c1");
    log.record("GDEF", "campaign.update", "c2");
    log.record("GABC", "user.ban", "u9");

    expect(log.list({ actor: "GABC" })).toHaveLength(2);
    expect(log.list({ action: "campaign.update" })).toHaveLength(2);
    expect(log.list({ actor: "GABC", action: "user.ban" })).toHaveLength(1);
  });

  it("returns copies that cannot change stored history", () => {
    const log = new AuditLog(fixedNow);
    log.record("GABC", "campaign.update", "c1");

    log.list()[0].target = "tampered";

    expect(log.list()[0].target).toBe("c1");
  });
});
