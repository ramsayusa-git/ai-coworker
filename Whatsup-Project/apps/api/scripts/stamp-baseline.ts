import "dotenv/config";
import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";

// One-off: marks the squashed 0000_baseline migration as already applied on a database
// that predates it (the dev box, and any environment built before 17 Sep 2026 by the old
// history plus `drizzle-kit push`). Without this the migrator would try to CREATE TABLE
// over tables that already exist.
//
// A brand-new database needs none of this — it just runs the baseline normally.
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const files = readMigrationFiles({ migrationsFolder: "./src/db/migrations" });
if (files.length !== 1) {
  console.error(`Expected exactly one baseline migration, found ${files.length}. Aborting.`);
  process.exit(1);
}
const baseline = files[0];

await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
)`;

const existing = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
const already = existing.some((r: any) => r.hash === baseline.hash);

if (already) {
  console.log("Baseline already recorded — nothing to do.");
} else {
  // Replace the stale history (which no longer corresponds to any file on disk) with
  // the single baseline row.
  await sql`DELETE FROM drizzle.__drizzle_migrations`;
  await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${baseline.hash}, ${Number(baseline.folderMillis)})`;
  console.log(`Stamped ${existing.length} old entries -> 1 baseline (${baseline.hash.slice(0, 12)}…).`);
}

await sql.end();
process.exit(0);
