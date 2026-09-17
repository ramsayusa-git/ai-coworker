// globalSetup runs BEFORE setupFiles, so tests/helpers/env.ts has not loaded .env yet
// and DATABASE_URL would be undefined here. Load it first.
import "dotenv/config";
import { recreateTestDatabase, migrateTestDatabase, seedTestCatalogue, dropTestDatabase } from "./db.js";

// Vitest still runs each test FILE in its own worker even with fileParallelism:false.
// When every file recreated `whatsup_test` at import time, one file's DROP DATABASE
// landed while another was mid-run, so a different pair of files failed on each run.
// The database lifecycle now has exactly one owner: built once here before any file
// loads, dropped once after the last one finishes.
export async function setup() {
  recreateTestDatabase();
  migrateTestDatabase();
  seedTestCatalogue();
}

export async function teardown() {
  dropTestDatabase();
}
