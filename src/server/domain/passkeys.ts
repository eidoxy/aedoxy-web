import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { passkey } from "@/server/db/schema";

export type PasskeySummary = { id: string; name: string | null; createdAt: Date | null; deviceType: string; backedUp: boolean; aaguid: string | null };

/** The user's passkeys for the security page. Never selects the public key or credential id. */
export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
  return db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, deviceType: passkey.deviceType, backedUp: passkey.backedUp, aaguid: passkey.aaguid })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(desc(passkey.createdAt));
}

export async function hasPasskey(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1);
  return !!row;
}
