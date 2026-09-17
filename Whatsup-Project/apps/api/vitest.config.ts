import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres database and one Fastify app, so they run
    // in a single process — parallel files would race on the same rows.
    fileParallelism: false,
    // The test database is created and migrated ONCE here, before any test file loads,
    // and dropped after the last one. Files must not recreate it themselves — each file
    // gets its own worker, so a file-level drop races every other file.
    globalSetup: ["./tests/helpers/global-setup.ts"],
    setupFiles: ["./tests/helpers/env.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
