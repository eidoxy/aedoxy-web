import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { writeAudit } from "./audit";

/**
 * Promotes a user to admin. Reachable only from scripts/make-admin.ts (shell
 * access to the server), never from an HTTP endpoint. Returns false when no
 * user has that email. Emails are matched case-insensitively.
 */
export async function makeAdmin(email: string): Promise<{ id: string; email: string; changed: boolean } | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) throw new RangeError("email is required");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(sql`lower(${user.email}) = ${wanted}`)
      .for("update");
    if (!row) return null;
    if (row.role === "admin") return { id: row.id, email: row.email, changed: false };
    await tx.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.id, row.id));
    await writeAudit(tx, {
      actor: { id: "cli:make-admin", ip: null },
      action: "user.make_admin",
      target: `user:${row.id}`,
      before: { role: row.role },
      after: { role: "admin" },
    });
    return { id: row.id, email: row.email, changed: true };
  });
}
