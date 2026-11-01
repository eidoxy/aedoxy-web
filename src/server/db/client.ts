import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/*
 * One pool per server process. The global keeps it across dev hot reloads.
 * Server code only: never import this from a "use client" file.
 * (The `server-only` package is not used because the Better Auth CLI and the
 * seed script load this module outside the React server runtime.)
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool = (globalForDb.pgPool ??= new Pool({ connectionString: env.DATABASE_URL, max: 10 }));

export const db = drizzle(pool, { schema });
/** Handle passed to the callback of `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export { pool };
