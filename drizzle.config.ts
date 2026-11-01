import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` needs no connection. `migrate`/`push` read DATABASE_URL
// (set in .env.local or the shell) and fail with a connection error if it is empty.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
