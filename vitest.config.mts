import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./src/server/test/setup-env.ts"],
    // Integration files share one Postgres database (aedoxy_test) and truncate it.
    fileParallelism: false,
  },
});
