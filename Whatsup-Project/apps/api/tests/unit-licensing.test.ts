import { describe, it, expect, beforeAll } from "vitest";

// Every unit test here is pure — no database, no network — so they run anywhere,
// including in CI with nothing provisioned.
beforeAll(() => { process.env.LICENSE_SIGNING_SECRET ??= "test-secret-do-not-use-in-production"; });

const load = async () => import("../src/licensing.js");

describe("licence keys", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    plan: "self_hosted_reseller", deployment: "self_hosted", name: "Acme Ltd",
    seats: 25, channels: 5, maxInstances: 2, whiteLabel: true, partner: null,
    from: new Date(Date.now() - 1000).toISOString(), until: null,
  };

  it("round-trips a signed key", async () => {
    const { signLicense, verifyLicenseKey } = await load();
    const key = signLicense(base);
    expect(key.startsWith("LQ1.")).toBe(true);
    const r = verifyLicenseKey(key);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.payload.name).toBe("Acme Ltd");
      expect(r.payload.seats).toBe(25);
      expect(r.payload.whiteLabel).toBe(true);
    }
  });

  it("rejects a tampered payload", async () => {
    const { signLicense, verifyLicenseKey } = await load();
    const key = signLicense(base);
    const [v, body, sig] = key.split(".");
    // Flip one character of the payload — the signature must no longer match.
    const mangled = `${v}.${body.slice(0, -1)}${body.slice(-1) === "A" ? "B" : "A"}.${sig}`;
    expect(verifyLicenseKey(mangled).valid).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { signLicense, verifyLicenseKey } = await load();
    const key = signLicense(base);
    const r = verifyLicenseKey(`${key.slice(0, -1)}X`);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("signature mismatch");
  });

  it("rejects a key signed with a different secret", async () => {
    const { signLicense } = await load();
    const key = signLicense(base);
    const prev = process.env.LICENSE_SIGNING_SECRET;
    process.env.LICENSE_SIGNING_SECRET = "a-completely-different-secret";
    // Re-import with the changed env: the module reads the secret per call.
    const { verifyLicenseKey } = await load();
    expect(verifyLicenseKey(key).valid).toBe(false);
    process.env.LICENSE_SIGNING_SECRET = prev;
  });

  it("rejects an expired key and one that is not yet valid", async () => {
    const { signLicense, verifyLicenseKey } = await load();
    const expired = signLicense({ ...base, until: new Date(Date.now() - 60_000).toISOString() });
    const future = signLicense({ ...base, from: new Date(Date.now() + 60_000).toISOString() });
    const e = verifyLicenseKey(expired);
    const f = verifyLicenseKey(future);
    expect(e.valid).toBe(false);
    expect(f.valid).toBe(false);
    if (!e.valid) expect(e.reason).toBe("expired");
    if (!f.valid) expect(f.reason).toBe("not yet valid");
  });

  it("rejects malformed input without throwing", async () => {
    const { verifyLicenseKey } = await load();
    for (const bad of ["", "nonsense", "LQ2.a.b", "LQ1.only-two-parts"]) {
      expect(verifyLicenseKey(bad).valid).toBe(false);
    }
  });
});
