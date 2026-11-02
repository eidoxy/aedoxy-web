import type { Tx } from "@/server/db/client";
import { adminAuditLog } from "@/server/db/schema";

/** Who did it. `ip` is best effort (see getAdminActor). */
export type Actor = { id: string; ip: string | null };

export type AuditEntry = {
  actor: Actor;
  /** Dotted verb, e.g. "pool.adjust". The audit page filters on its prefix. */
  action: string;
  /** "type:id", e.g. "plan:12". */
  target?: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Every admin action writes its audit row through this function, on the SAME
 * transaction handle as the change itself, so a rollback removes both.
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(adminAuditLog).values({
    actorId: entry.actor.id,
    action: entry.action,
    target: entry.target,
    before: entry.before,
    after: entry.after,
    ip: entry.actor.ip,
  });
}

/** Expected, user-facing failure of an admin action. `message` is Indonesian and safe to show. */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly code = "ADMIN_ERROR",
  ) {
    super(message);
    this.name = "AdminError";
  }
}
