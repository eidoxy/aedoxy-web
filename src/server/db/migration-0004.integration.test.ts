import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "./client";
import { prepareDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());

describe("migration 0004 (passkey, fresh_auth)", () => {
  it("can be run again on a database that already has it", async () => {
    const file = fileURLToPath(new URL("../../../drizzle/0004_passkey_fresh_auth.sql", import.meta.url));
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { rows } = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename in ('passkey', 'fresh_auth')`);
    expect(rows.map((r) => r.tablename).sort()).toEqual(["fresh_auth", "passkey"]);
  });
});
