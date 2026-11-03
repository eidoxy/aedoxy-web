import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "./client";
import { prepareDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());

describe("migration 0008 (rate_limits, rate_limit)", () => {
  it("can be run again on a database that already has it", async () => {
    const file = fileURLToPath(new URL("../../../drizzle/0008_rate_limits.sql", import.meta.url));
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBe(4);
    for (const statement of statements) await db.execute(sql.raw(statement));

    const { rows: tables } = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename in ('rate_limits', 'rate_limit')`);
    expect(tables.map((r) => r.tablename).sort()).toEqual(["rate_limit", "rate_limits"]);
    const { rows: indexes } = await db.execute<{ indexname: string }>(sql`select indexname from pg_indexes where indexname in ('rate_limits_reset_at_idx', 'rate_limit_last_request_idx')`);
    expect(indexes).toHaveLength(2);
  });
});
