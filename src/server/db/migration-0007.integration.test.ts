import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "./client";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());

describe("migration 0007 (user.console_disabled)", () => {
  it("can be run again, and existing rows read false", async () => {
    await resetDatabase();
    const u = await seedUser();
    const file = fileURLToPath(new URL("../../../drizzle/0007_console_disabled.sql", import.meta.url));
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { rows } = await db.execute<{ is_nullable: string; column_default: string }>(
      sql`select is_nullable, column_default from information_schema.columns where table_name = 'user' and column_name = 'console_disabled'`,
    );
    expect(rows).toEqual([{ is_nullable: "NO", column_default: "false" }]);
    const { rows: values } = await db.execute<{ console_disabled: boolean }>(sql`select console_disabled from "user" where id = ${u.id}`);
    expect(values[0].console_disabled).toBe(false);
  });
});
