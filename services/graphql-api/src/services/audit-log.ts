/** One recorded action on a resource (#1701). */
export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  at: string;
}

export interface AuditFilter {
  actor?: string;
  action?: string;
}

/**
 * Append-only record of who did what to which resource. Entries are copied
 * on the way out so callers cannot change the stored history.
 */
export class AuditLog {
  private readonly entries: AuditEntry[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  record(actor: string, action: string, target: string): AuditEntry {
    if (!actor || !action) {
      throw new Error("audit entries need an actor and an action");
    }
    const entry: AuditEntry = { actor, action, target, at: this.now().toISOString() };
    this.entries.push(entry);
    return { ...entry };
  }

  list(filter: AuditFilter = {}): AuditEntry[] {
    return this.entries
      .filter((e) => (!filter.actor || e.actor === filter.actor) && (!filter.action || e.action === filter.action))
      .map((e) => ({ ...e }));
  }
}
