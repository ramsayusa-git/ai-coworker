import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres database and one Fastify app, so they run
    // in a single process — parallel files would race on the same rows.
    fileParallelism: false,
    setupFiles: ["./tests/helpers/env.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
