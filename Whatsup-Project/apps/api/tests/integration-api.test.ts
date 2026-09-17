import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { recreateTestDatabase, migrateTestDatabase, seedTestCatalogue, dropTestDatabase } from "./helpers/db.js";

// Build the schema BEFORE importing anything that opens a connection pool.
recreateTestDatabase();
migrateTestDatabase();
seedTestCatalogue();

const { buildApp, body } = await import("./helpers/app.js");

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let orgId = "";
const EMAIL = "e2e@loqio.test";
const PASSWORD = "E2e@Test2026";

beforeAll(async () => {
  app = await buildApp();
  // Self-serve registration is the real front door — use it rather than inserting rows.
  const reg = await app.inject({
    method: "POST", url: "/v1/auth/register",
    payload: { email: EMAIL, password: PASSWORD, name: "E2E User", orgName: "E2E Test Org" },
  });
  expect(reg.statusCode).toBeLessThan(300);
  const r = body(reg);
  token = r.token;
  orgId = r.user?.orgId;
  expect(token).toBeTruthy();
  expect(orgId).toBeTruthy();
});

afterAll(async () => {
  await app?.close();
  dropTestDatabase();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("auth", () => {
  it("logs in with the registered credentials", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: EMAIL, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    expect(body(res).token).toBeTruthy();
    expect(body(res).refreshToken).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: EMAIL, password: "wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("refuses org routes without a token", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts` });
    expect(res.statusCode).toBe(401);
  });

  it("refuses a token whose org does not match the URL", async () => {
    const other = "00000000-0000-0000-0000-0000000000ff";
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${other}/contacts`, headers: auth() });
    expect(res.statusCode).toBe(403);
  });
});

describe("contacts", () => {
  it("creates and lists a contact", async () => {
    const create = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/contacts`, headers: auth(),
      payload: { name: "Test Person", phoneE164: "+919800000001", email: "tp@example.com", tags: ["e2e"] },
    });
    expect(create.statusCode).toBeLessThan(300);

    const list = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts`, headers: auth() });
    expect(list.statusCode).toBe(200);
    const rows = body(list) as unknown as any[];
    expect(rows.some((c) => c.phoneE164 === "+919800000001")).toBe(true);
  });
});

describe("templates and interactive validation", () => {
  let templateId = "";

  it("creates an interactive template", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/templates`, headers: auth(),
      payload: {
        name: "e2e_buttons", category: "MARKETING", body: "Hi {{1}}, pick one",
        interactiveType: "buttons",
        buttons: [{ kind: "quick_reply", text: "Yes", payload: "y" }, { kind: "quick_reply", text: "No", payload: "n" }],
      },
    });
    expect(res.statusCode).toBe(201);
    const t = body(res);
    templateId = t.id;
    expect(t.status).toBe("pending");      // WhatsApp templates start pending
    expect(t.variables).toEqual(["1"]);    // variables parsed out of the body
  });

  it("returns the real Meta payload from the preview endpoint", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/templates/${templateId}/preview`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const p = body(res);
    expect(p.payload.type).toBe("interactive");
    expect(p.payload.interactive.type).toBe("button");
    expect(p.payload.interactive.action.buttons).toHaveLength(2);
  });

  it("enforces WhatsApp's 3-quick-reply limit", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/templates`, headers: auth(),
      payload: {
        name: "e2e_toomany", category: "MARKETING", body: "x", interactiveType: "buttons",
        buttons: ["a", "b", "c", "d"].map((t) => ({ kind: "quick_reply", text: t })),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(body(res).error).toMatch(/3 quick-reply/i);
  });

  it("sends an edited template back to pending", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/v1/orgs/${orgId}/templates/${templateId}`, headers: auth(),
      payload: { body: "Hi {{1}}, changed" },
    });
    expect(res.statusCode).toBe(200);
    expect(body(res).status).toBe("pending");
  });
});

describe("billing", () => {
  it("serves the public plan catalogue without a token", async () => {
    const plans = await app.inject({ method: "GET", url: "/v1/plans" });
    expect(plans.statusCode).toBe(200);
    const ids = (body(plans) as unknown as any[]).map((p) => p.id);
    expect(ids).toContain("free");
  });

  it("reports the org's plan, wallet and rate card", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/billing`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const b = body(res);
    expect(b.plan).toBeTruthy();
    expect(typeof b.walletPaise).toBe("number");
  });

  it("credits the wallet and writes a ledger row", async () => {
    const top = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/billing/topup`, headers: auth(),
      payload: { amountPaise: 50000, reason: "e2e top-up" },
    });
    expect(top.statusCode).toBe(200);
    const after = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/billing`, headers: auth() }));
    expect(after.walletPaise).toBeGreaterThanOrEqual(50000);

    const ledger = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/billing/transactions`, headers: auth() })) as unknown as any[];
    expect(ledger.some((t) => t.reason === "e2e top-up")).toBe(true);
  });
});

describe("plan gating", () => {
  it("blocks webhooks and API keys on the Free plan with 402", async () => {
    const hook = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/webhook-endpoints`, headers: auth(),
      payload: { url: "https://example.com/hook", events: ["message.received"] },
    });
    expect(hook.statusCode).toBe(402);

    const key = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/api-keys`, headers: auth(), payload: { name: "should fail" },
    });
    expect(key.statusCode).toBe(402);
  });

  it("allows them once the org moves to Advanced", async () => {
    const change = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/billing/plan`, headers: auth(),
      payload: { planId: "advanced", cycle: "monthly" },
    });
    expect(change.statusCode).toBe(200);

    const hook = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/webhook-endpoints`, headers: auth(),
      payload: { url: "https://example.com/hook", events: ["message.received"] },
    });
    expect(hook.statusCode).toBe(200);
    // The signing secret is returned exactly once, at creation.
    expect(body(hook).secret).toMatch(/^whsec_/);

    const list = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/webhook-endpoints`, headers: auth() })) as unknown as any[];
    expect(list[0].secret).toBeUndefined();
    expect(list[0].secretSet).toBe(true);
  });
});

describe("developer API", () => {
  let apiKey = "";

  it("issues a key whose plaintext is shown once", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/api-keys`, headers: auth(), payload: { name: "e2e key" },
    });
    expect(res.statusCode).toBe(200);
    apiKey = body(res).key;
    expect(apiKey).toMatch(/^loq_live_/);

    const list = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/api-keys`, headers: auth() })) as unknown as any[];
    expect(list[0].keyHash).toBeUndefined();  // only the hash is stored, never returned
    expect(list[0].prefix).toBe(apiKey.slice(0, 16));
  });

  it("authenticates the public API with the key", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: { "x-api-key": apiKey } });
    expect(res.statusCode).toBe(200);
    expect(body(res).orgId).toBe(orgId);
  });

  it("rejects a missing or bogus key", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { "x-api-key": "loq_live_nope" } })).statusCode).toBe(401);
  });

  it("writes a contact through the public API", async () => {
    const ok = await app.inject({
      method: "POST", url: "/api/v1/contacts", headers: { "x-api-key": apiKey },
      payload: { phoneE164: "+919800000002", name: "Via API" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("stops working when the key is revoked", async () => {
    const keys = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/api-keys`, headers: auth() })) as unknown as any[];
    const id = keys.find((k) => k.name === "e2e key").id;
    await app.inject({ method: "DELETE", url: `/v1/orgs/${orgId}/api-keys/${id}`, headers: auth() });
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: { "x-api-key": apiKey } });
    expect(res.statusCode).toBe(401);
  });
});

describe("dashboard layout", () => {
  it("returns defaults, saves a custom layout, then resets", async () => {
    const def = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/dashboard-layout`, headers: auth() }));
    expect(def.isDefault).toBe(true);
    expect(def.widgets.length).toBeGreaterThan(0);

    const custom = [{ id: "w1", type: "kpis", w: 2, h: 1 }];
    const put = await app.inject({
      method: "PUT", url: `/v1/orgs/${orgId}/dashboard-layout`, headers: auth(), payload: { widgets: custom },
    });
    expect(put.statusCode).toBe(200);

    const saved = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/dashboard-layout`, headers: auth() }));
    expect(saved.widgets).toEqual(custom);
    expect(saved.isDefault).toBe(false);

    await app.inject({ method: "DELETE", url: `/v1/orgs/${orgId}/dashboard-layout`, headers: auth() });
    const reset = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/dashboard-layout`, headers: auth() }));
    expect(reset.isDefault).toBe(true);
  });
});
