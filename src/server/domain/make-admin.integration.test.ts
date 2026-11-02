import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, user } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { makeAdmin } from "./make-admin";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

describe("makeAdmin", () => {
  it("sets the role, matches the email case-insensitively and writes an audit row", async () => {
    const u = await seedUser({ email: "Boss@Example.com" });

    const result = await makeAdmin("  boss@example.COM ");

    expect(result).toMatchObject({ id: u.id, changed: true });
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.role).toBe("admin");
    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "user.make_admin", target: `user:${u.id}`, after: { role: "admin" } });
  });

  it("is a no-op for an existing admin", async () => {
    const u = await seedUser({ role: "admin" });
    expect(await makeAdmin(u.email)).toMatchObject({ changed: false });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("returns null for an unknown email and changes nobody", async () => {
    const u = await seedUser();
    expect(await makeAdmin("nobody@example.com")).toBeNull();
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.role).toBeNull();
  });

  it("rejects an empty email", async () => {
    await expect(makeAdmin("   ")).rejects.toThrow(RangeError);
  });
});
