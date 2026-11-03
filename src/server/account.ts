import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { ensureConsoleAccount } from "@/server/integrations/newapi";

/**
 * Links the Aedoxy user to a New API console user and stores `newapi_user_id`.
 * Idempotent: a no-op once linked, and the bridge itself is idempotent per `subject`.
 * Returns the console user id, or null when the user does not exist or is not verified.
 * Throws NewApiError when the bridge fails; callers decide whether that matters.
 */
export async function ensureConsoleAccountForUser(userId: string): Promise<number | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!row || !row.emailVerified) return null;
  if (row.newapiUserId != null) return row.newapiUserId;

  const account = await ensureConsoleAccount({
    subject: row.id,
    email: row.email,
    displayName: row.name,
    // null for accounts created before usernames existed; the console then picks a name.
    username: row.username ?? undefined,
  });
  await db.update(user).set({ newapiUserId: account.userId }).where(eq(user.id, row.id));
  return account.userId;
}
