import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "./client";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());

describe("migration 0009 (user.deleted_at)", () => {
  it("can be run again, the column is a nullable timestamptz and existing rows read NULL", async () => {
    await resetDatabase();
    const u = await seedUser();
    const file = fileURLToPath(new URL("../../../drizzle/0009_user_deleted_at.sql", import.meta.url));
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { rows } = await db.execute<{ is_nullable: string; data_type: string }>(
      sql`select is_nullable, data_type from information_schema.columns where table_name = 'user' and column_name = 'deleted_at'`,
    );
    expect(rows).toEqual([{ is_nullable: "YES", data_type: "timestamp with time zone" }]);
    const { rows: values } = await db.execute<{ deleted_at: Date | null }>(sql`select deleted_at from "user" where id = ${u.id}`);
    expect(values[0].deleted_at).toBeNull();
  });
});
