import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "./client";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(async () => {
  await resetDatabase();
  await pgPool.end();
});

describe("migration 0006 (username)", () => {
  it("can be run again on a database that already has it", async () => {
    const file = fileURLToPath(new URL("../../../drizzle/0006_username.sql", import.meta.url));
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(3);
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { rows: columns } = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'user' and column_name in ('username', 'display_username')`,
    );
    expect(columns.map((r) => r.column_name).sort()).toEqual(["display_username", "username"]);
    const { rows: indexes } = await db.execute<{ indexdef: string }>(sql`select indexdef from pg_indexes where indexname = 'user_username_uidx'`);
    expect(indexes[0]?.indexdef).toMatch(/UNIQUE/);
  });

  it("lets accounts without a username coexist but not two equal usernames", async () => {
    await resetDatabase();
    const insert = (id: string, username: string | null) =>
      db.execute(sql`insert into "user" (id, name, email, created_at, updated_at, username) values (${id}, 'n', ${id + "@example.com"}, now(), now(), ${username})`);
    await insert("a", null);
    await insert("b", null);
    await insert("c", "same");
    await expect(insert("d", "same")).rejects.toThrow();
  });
});
