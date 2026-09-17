import { execSync } from "node:child_process";

// Integration tests run against their own database, created and dropped per run, so a
// test can never touch the dev data (or leave rows behind in it). The role and host
// come from DATABASE_URL; only the database name is swapped.
export const TEST_DB = process.env.TEST_DB_NAME ?? "whatsup_test";

function baseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set to run integration tests");
  return url;
}

export function testDatabaseUrl() {
  const u = new URL(baseUrl());
  u.pathname = `/${TEST_DB}`;
  return u.toString();
}

function psqlEnv() {
  const u = new URL(baseUrl());
  return {
    ...process.env,
    PGPASSWORD: decodeURIComponent(u.password),
    PGUSER: decodeURIComponent(u.username),
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
  };
}

export function recreateTestDatabase() {
  const env = psqlEnv();
  // Terminate stragglers first, or DROP DATABASE fails when a previous run leaked a
  // connection.
  execSync(
    `psql -d postgres -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${TEST_DB}' and pid <> pg_backend_pid()" ` +
    `-c "drop database if exists ${TEST_DB}" -c "create database ${TEST_DB}"`,
    { env, stdio: "pipe" }
  );
}

export function migrateTestDatabase() {
  execSync("npx tsx src/db/migrate.ts", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), NODE_ENV: "development", RLS_BYPASS: "on" },
    stdio: "pipe",
  });
}

// The plan and rate catalogue lives in seed scripts, not migrations — an empty
// database has no plans, so every entitlement check would fail. Running the real seeds
// here also means a broken seed script fails the test run.
export function seedTestCatalogue() {
  // Seeds write plan/rate rows across orgs, so they need the explicit RLS bypass that
  // migration 0004 requires of any query not scoped by withOrgDb.
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl(), NODE_ENV: "development", RLS_BYPASS: "on" };
  execSync("npx tsx src/db/seed-billing.ts", { env, stdio: "pipe" });
  execSync("npx tsx src/db/seed-editions.ts", { env, stdio: "pipe" });
}

export function dropTestDatabase() {
  try {
    execSync(
      `psql -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${TEST_DB}' and pid <> pg_backend_pid()" ` +
      `-c "drop database if exists ${TEST_DB}"`,
      { env: psqlEnv(), stdio: "pipe" }
    );
  } catch { /* best effort — a leftover test database is noise, not a failure */ }
}
