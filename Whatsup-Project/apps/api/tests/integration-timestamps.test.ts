import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
// The test database is built once in tests/helpers/global-setup.ts.
import { testDatabaseUrl } from "./helpers/db.js";

const { buildApp, body } = await import("./helpers/app.js");

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let orgId = "";
const auth = () => ({ authorization: `Bearer ${token}` });

function psql(sql: string) {
  const u = new URL(testDatabaseUrl());
  return execSync(`psql "${testDatabaseUrl()}" -t -A -c "${sql}"`, {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
    encoding: "utf8",
  }).trim();
}

beforeAll(async () => {
  app = await buildApp();
  const reg = await app.inject({
    method: "POST", url: "/v1/auth/register",
    payload: { email: "tz@loqio.test", password: "Tz@Test2026", name: "TZ User", orgName: "TZ Test Org" },
  });
  token = body(reg).token;
  orgId = body(reg).user?.orgId;
});

afterAll(async () => {
  await app?.close();
});

describe("timestamp storage", () => {
  it("stores every *_at column as timestamptz", () => {
    // Regression: these were all `timestamp without time zone`, so Postgres kept the
    // server's local wall-clock and the driver read it back as UTC. Every date in the
    // product was then off by the server's offset — a just-created row rendered as
    // "-313m ago", and SLA deadlines and reminders were skewed by the same amount.
    const naive = psql(
      "select count(*) from information_schema.columns " +
      "where table_schema='public' and column_name like '%_at' " +
      "and data_type='timestamp without time zone'"
    );
    expect(Number(naive)).toBe(0);

    const aware = psql(
      "select count(*) from information_schema.columns " +
      "where table_schema='public' and column_name like '%_at' " +
      "and data_type='timestamp with time zone'"
    );
    expect(Number(aware)).toBeGreaterThan(50);
  });

  it("round-trips a freshly created row as a time in the past, not the future", async () => {
    const before = Date.now();
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/contacts`, headers: auth(),
      payload: { name: "Clock Check", phoneE164: "+919800777001" },
    });
    expect(res.statusCode).toBeLessThan(300);
    const after = Date.now();

    const row = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts`, headers: auth() })) as unknown as any[])
      .find((c) => c.phoneE164 === "+919800777001");
    expect(row).toBeTruthy();

    // The createdAt the API serves must fall inside the window we just observed. Under
    // the old naive columns this landed hours away from it.
    const created = new Date(row.createdAt).getTime();
    expect(created).toBeGreaterThanOrEqual(before - 60_000);
    expect(created).toBeLessThanOrEqual(after + 60_000);
  });

  it("keeps a computed SLA deadline the right distance in the future", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets`, headers: auth(),
      payload: { subject: "Clock check ticket", priority: "high" },
    });
    expect(res.statusCode).toBe(201);
    // high = 4h. A timezone skew on write or read would move this by whole hours.
    const hours = (new Date(body(res).slaDueAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThan(4.1);
  });
});
