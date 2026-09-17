import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { recreateTestDatabase, migrateTestDatabase, seedTestCatalogue, dropTestDatabase } from "./helpers/db.js";

recreateTestDatabase();
migrateTestDatabase();
seedTestCatalogue();

const { buildApp, body } = await import("./helpers/app.js");

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let partnerId = "";
let licenseKey = "";
let licenseId = "";

beforeAll(async () => {
  app = await buildApp();
  const reg = body(await app.inject({
    method: "POST", url: "/v1/auth/register",
    payload: { email: "reseller@loqio.test", password: "Reseller@2026", name: "Reseller", orgName: "Reseller Org" },
  }));
  token = reg.token;

  // Any signed-in user can become a partner — that is the "become a reseller" flow.
  const partner = body(await app.inject({
    method: "POST", url: "/v1/partners", headers: { authorization: `Bearer ${token}` },
    payload: { name: "Test Reseller Ltd" },
  }));
  partnerId = partner.id;
  expect(partnerId).toBeTruthy();
});

afterAll(async () => {
  await app?.close();
  dropTestDatabase();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("issuing licences", () => {
  it("refuses a hosted plan — hosted deployments need no key", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/partners/${partnerId}/licenses`, headers: auth(),
      payload: { planId: "advanced", issuedToName: "Should Fail" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("issues a self-hosted licence and returns the key exactly once", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/partners/${partnerId}/licenses`, headers: auth(),
      payload: {
        planId: "self_hosted_reseller", issuedToName: "Acme Manufacturing",
        issuedToEmail: "ops@acme.test", seats: 25, channels: 5, maxInstances: 1, months: 12,
      },
    });
    expect(res.statusCode).toBe(201);
    const l = body(res);
    licenseKey = l.key;
    licenseId = l.id;
    expect(licenseKey).toMatch(/^LQ1\./);
    expect(l.whiteLabel).toBe(true);

    // Listing must never return the full key again.
    const list = body(await app.inject({
      method: "GET", url: `/v1/partners/${partnerId}/licenses`, headers: auth(),
    })) as unknown as any[];
    expect(list[0].key).toBeUndefined();
    expect(list[0].keyTail).toBe(licenseKey.slice(-8));
  });

  it("refuses a partner account the caller does not belong to", async () => {
    const other = body(await app.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { email: "outsider@loqio.test", password: "Outsider@2026", name: "Out", orgName: "Outsider Org" },
    }));
    const res = await app.inject({
      method: "GET", url: `/v1/partners/${partnerId}/licenses`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("verifying and activating", () => {
  it("verifies a key offline, with no session", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/license/verify", payload: { key: licenseKey } });
    expect(res.statusCode).toBe(200);
    const v = body(res);
    expect(v.valid).toBe(true);
    expect(v.issuedTo).toBe("Acme Manufacturing");
    expect(v.seats).toBe(25);
    expect(v.deployment).toBe("self_hosted");
  });

  it("rejects a tampered key", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/license/verify", payload: { key: `${licenseKey.slice(0, -1)}X` },
    });
    expect(res.statusCode).toBe(400);
    expect(body(res).valid).toBe(false);
  });

  it("activates an instance and returns its entitlements", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/license/activate",
      payload: { key: licenseKey, instanceId: "inst-1", hostname: "acme-prod", version: "1.0.0" },
    });
    expect(res.statusCode).toBe(200);
    expect(body(res).entitlements.seats).toBe(25);
  });

  it("enforces the instance cap", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/license/activate",
      payload: { key: licenseKey, instanceId: "inst-2", hostname: "acme-dr" },
    });
    expect(res.statusCode).toBe(409);
    expect(body(res).error).toMatch(/1 instance/);
  });

  it("accepts a heartbeat from a known instance without wiping its details", async () => {
    const beat = await app.inject({
      method: "POST", url: "/v1/license/activate",
      payload: { key: licenseKey, instanceId: "inst-1" },   // no hostname/version this time
    });
    expect(beat.statusCode).toBe(200);

    const acts = body(await app.inject({
      method: "GET", url: `/v1/partners/${partnerId}/licenses/${licenseId}/activations`, headers: auth(),
    })) as unknown as any[];
    const inst = acts.find((a) => a.instanceId === "inst-1");
    expect(inst.hostname).toBe("acme-prod");   // preserved, not nulled by the heartbeat
    expect(inst.version).toBe("1.0.0");
  });
});

describe("suspension and revocation", () => {
  it("stops activation while suspended and resumes after", async () => {
    await app.inject({
      method: "PATCH", url: `/v1/partners/${partnerId}/licenses/${licenseId}`,
      headers: auth(), payload: { status: "suspended" },
    });
    const blocked = await app.inject({
      method: "POST", url: "/v1/license/activate", payload: { key: licenseKey, instanceId: "inst-1" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(body(blocked).error).toMatch(/suspended/i);

    await app.inject({
      method: "PATCH", url: `/v1/partners/${partnerId}/licenses/${licenseId}`,
      headers: auth(), payload: { status: "active" },
    });
    const ok = await app.inject({
      method: "POST", url: "/v1/license/activate", payload: { key: licenseKey, instanceId: "inst-1" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("frees an instance slot so a replacement machine can activate", async () => {
    const acts = body(await app.inject({
      method: "GET", url: `/v1/partners/${partnerId}/licenses/${licenseId}/activations`, headers: auth(),
    })) as unknown as any[];
    const id = acts.find((a) => a.instanceId === "inst-1").id;

    await app.inject({
      method: "DELETE", url: `/v1/partners/${partnerId}/licenses/${licenseId}/activations/${id}`, headers: auth(),
    });

    const replacement = await app.inject({
      method: "POST", url: "/v1/license/activate",
      payload: { key: licenseKey, instanceId: "inst-3", hostname: "acme-new" },
    });
    expect(replacement.statusCode).toBe(200);
  });

  it("refuses a revoked licence permanently", async () => {
    await app.inject({
      method: "PATCH", url: `/v1/partners/${partnerId}/licenses/${licenseId}`,
      headers: auth(), payload: { status: "revoked" },
    });
    const res = await app.inject({
      method: "POST", url: "/v1/license/activate", payload: { key: licenseKey, instanceId: "inst-3" },
    });
    expect(res.statusCode).toBe(403);
    expect(body(res).error).toMatch(/revoked/i);
  });
});
