import { describe, it, expect, afterAll } from "vitest";
import {
  assertSafeSchemaName, ISOLATION_TIERS, resolveTenant, setSecretResolver,
  closeTenantPools, type SecretResolver,
} from "../src/db/tenancy.js";
import { schemaNameFor, secretRefFor, isStrongerIsolation } from "../src/services/provisioning.js";

// A fake Drizzle handle — resolveTenant only ever passes it through.
const controlPlane = { __control: true } as any;

// The secret resolver is module-level state, and vitest shares modules between test files
// in the same worker. Leaving a stub installed here made an unrelated integration file
// route its queries to a fake pool — so it is restored, and the pools opened by these
// tests are closed, when this file finishes.
const realResolver: SecretResolver = async (ref) => {
  const key = `TENANT_DB_${ref.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  return process.env[key];
};

afterAll(async () => {
  setSecretResolver(realResolver);
  await closeTenantPools();
});

describe("schema name safety", () => {
  it("accepts the names provisioning actually generates", () => {
    const name = schemaNameFor("18add68e-37a7-41e3-be53-313d700cea92");
    expect(name).toBe("org_18add68e37a741e3be53313d700cea92");
    expect(() => assertSafeSchemaName(name)).not.toThrow();
  });

  it("rejects anything that could break out of SET search_path", () => {
    // search_path cannot be parameterised, so this validator is the only thing standing
    // between a stored schema name and SQL injection at connection setup.
    for (const bad of [
      'public"; DROP TABLE orgs; --',
      "org_1; SELECT 1",
      "org 1",
      "1org",
      "Org_Upper",
      "",
      "org-1",
      "a".repeat(64),
    ]) {
      expect(() => assertSafeSchemaName(bad), bad).toThrow();
    }
  });
});

describe("isolation tier ordering", () => {
  it("orders tiers weakest to strongest", () => {
    expect(ISOLATION_TIERS).toEqual(["row", "schema", "database", "app"]);
  });

  it("compares strength correctly", () => {
    expect(isStrongerIsolation("database", "row")).toBe(true);
    expect(isStrongerIsolation("app", "database")).toBe(true);
    expect(isStrongerIsolation("row", "schema")).toBe(false);
    expect(isStrongerIsolation("schema", "schema")).toBe(false);
  });
});

describe("tenant routing", () => {
  it("routes row isolation to the shared control plane", async () => {
    const out = await resolveTenant({ orgId: "o1", isolation: "row" }, controlPlane);
    expect(out.db).toBe(controlPlane);
    expect(out.searchPath).toBeUndefined();
  });

  it("pins search_path for schema isolation", async () => {
    const out = await resolveTenant(
      { orgId: "o1", isolation: "schema", schemaName: "org_abc" }, controlPlane);
    expect(out.db).toBe(controlPlane);
    expect(out.searchPath).toBe("org_abc");
  });

  it("degrades to row isolation when a schema tenant has no schema name", async () => {
    // Failing closed would take the tenant offline; RLS still isolates them either way,
    // so the safe degradation is to row isolation.
    const out = await resolveTenant({ orgId: "o1", isolation: "schema" }, controlPlane);
    expect(out.db).toBe(controlPlane);
    expect(out.searchPath).toBeUndefined();
  });

  it("REFUSES to fall back to the shared database when a tenant secret cannot be resolved", async () => {
    // This is the important one: a database-isolated tenant whose secret is missing must
    // error, never quietly serve its queries from the shared database.
    setSecretResolver(async () => undefined);
    await expect(
      resolveTenant({ orgId: "o1", isolation: "database", secretRef: "tenant_missing" }, controlPlane)
    ).rejects.toThrow(/could not be resolved/i);
  });

  it("routes a database tenant to its own pool, not the control plane", async () => {
    // A syntactically valid URL is enough: postgres-js does not connect until first query.
    setSecretResolver(async () => "postgres://u:p@127.0.0.1:5432/tenant_one");
    const out = await resolveTenant(
      { orgId: "o1", isolation: "database", secretRef: "tenant_one" }, controlPlane);
    expect(out.db).not.toBe(controlPlane);
  });

  it("derives a stable secret reference per org", () => {
    const ref = secretRefFor("18add68e-37a7-41e3-be53-313d700cea92");
    expect(ref).toBe("tenant_18add68e37a741e3be53313d700cea92");
    expect(secretRefFor("18add68e-37a7-41e3-be53-313d700cea92")).toBe(ref);
  });
});
