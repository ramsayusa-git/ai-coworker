import { describe, it, expect, beforeAll, afterAll } from "vitest";

// The test database is built once in tests/helpers/global-setup.ts.

const { buildApp, body } = await import("./helpers/app.js");

let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let orgId = "";
let contactId = "";
let ownerUserId = "";

const EMAIL = "crm@loqio.test";
const PASSWORD = "Crm@Test2026";
const auth = () => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await buildApp();
  const reg = await app.inject({
    method: "POST", url: "/v1/auth/register",
    payload: { email: EMAIL, password: PASSWORD, name: "CRM User", orgName: "CRM Test Org" },
  });
  expect(reg.statusCode).toBeLessThan(300);
  token = body(reg).token;
  orgId = body(reg).user?.orgId;
  ownerUserId = body(reg).user?.id;
  expect(orgId).toBeTruthy();
  expect(ownerUserId).toBeTruthy();

  const c = await app.inject({
    method: "POST", url: `/v1/orgs/${orgId}/contacts`, headers: auth(),
    payload: { name: "Aarti Menon", phoneE164: "+919800100200", tags: ["vip"], source: "ads" },
  });
  expect(c.statusCode).toBeLessThan(300);
  contactId = body(c).id;
  expect(contactId).toBeTruthy();
});

afterAll(async () => {
  await app?.close();
});

describe("tickets", () => {
  let ticketId = "";

  it("numbers tickets per org starting at 1 and sets an SLA from the priority", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets`, headers: auth(),
      payload: { subject: "Order never arrived", body: "Placed on Monday", priority: "high", contactId },
    });
    expect(res.statusCode).toBe(201);
    const t = body(res);
    ticketId = t.id;
    expect(t.number).toBe(1);
    expect(t.status).toBeTruthy();

    // high = 4h to first response; allow a minute of slack for test execution time.
    const hours = (new Date(t.slaDueAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThan(4.1);
  });

  it("rejects a ticket with no subject", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets`, headers: auth(), payload: { body: "no subject" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("logs a creation event", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/tickets/${ticketId}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const t = body(res);
    const events = (t.events ?? []) as any[];
    expect(events.some((e) => e.kind === "created")).toBe(true);
  });

  it("re-bases the SLA when the priority is escalated", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/v1/orgs/${orgId}/tickets/${ticketId}`, headers: auth(),
      payload: { priority: "urgent" },
    });
    expect(res.statusCode).toBe(200);
    const hours = (new Date(body(res).slaDueAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThan(2.1);
  });

  it("stops the SLA clock on the first customer-facing reply, not on an internal note", async () => {
    const note = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets/${ticketId}/events`, headers: auth(),
      payload: { kind: "note", body: "Checking with the courier" },
    });
    expect(note.statusCode).toBeLessThan(300);
    let t = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/tickets/${ticketId}`, headers: auth() }));
    expect(t.firstResponseAt).toBeFalsy();

    const reply = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets/${ticketId}/events`, headers: auth(),
      payload: { kind: "reply", body: "Refund issued, sorry about that" },
    });
    expect(reply.statusCode).toBeLessThan(300);
    t = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/tickets/${ticketId}`, headers: auth() }));
    expect(t.firstResponseAt).toBeTruthy();
  });

  it("applies a routing rule to a newly created ticket", async () => {
    const rule = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/ticket-rules`, headers: auth(),
      payload: {
        name: "Refunds are urgent", position: 0, enabled: true,
        conditions: [{ field: "subject", op: "contains", value: "refund" }],
        action: "set_priority", actionConfig: { priority: "urgent" },
      },
    });
    expect(rule.statusCode).toBeLessThan(300);

    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets`, headers: auth(),
      payload: { subject: "Please process my refund", priority: "low", contactId },
    });
    expect(res.statusCode).toBe(201);
    // The rule overrides the caller-supplied "low".
    expect(body(res).priority).toBe("urgent");
  });

  it("merges a duplicate into the survivor", async () => {
    const dup = body(await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets`, headers: auth(),
      payload: { subject: "Duplicate of the refund issue", contactId },
    }));
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/tickets/${dup.id}/merge`, headers: auth(),
      payload: { intoId: ticketId },
    });
    expect(res.statusCode).toBeLessThan(300);
    const after = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/tickets/${dup.id}`, headers: auth() }));
    expect(after.mergedIntoId).toBe(ticketId);
  });
});

describe("lead scoring and distribution", () => {
  it("scores a contact only for the rules it actually matches, with reasons", async () => {
    const mk = (p: any) => app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/lead-scoring-rules`, headers: auth(), payload: p,
    });
    expect((await mk({ name: "VIP tag", criterion: "has_tag", value: "vip", points: 30, enabled: true })).statusCode).toBeLessThan(300);
    expect((await mk({ name: "From ads", criterion: "source_is", value: "ads", points: 20, enabled: true })).statusCode).toBeLessThan(300);
    // Deliberately unmatched: the contact has no such tag.
    expect((await mk({ name: "Churn risk", criterion: "has_tag", value: "churn", points: 50, enabled: true })).statusCode).toBeLessThan(300);

    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/leads/scored`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const rows = body(res) as unknown as any[];
    const mine = rows.find((r) => r.id === contactId);
    expect(mine).toBeTruthy();
    expect(mine.score).toBe(50); // 30 + 20, not 100
    expect(mine.scoreReasons.length).toBe(2);
    expect(mine.scoreReasons.join(" ")).toContain("VIP tag");
    expect(mine.scoreReasons.join(" ")).not.toContain("Churn risk");
  });

  it("ignores a disabled rule", async () => {
    const before = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/leads/scored`, headers: auth() })) as unknown as any[])
      .find((r) => r.id === contactId).score;
    const r = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/lead-scoring-rules`, headers: auth(),
      payload: { name: "Disabled bonus", criterion: "has_tag", value: "vip", points: 999, enabled: false },
    });
    expect(r.statusCode).toBeLessThan(300);
    const after = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/leads/scored`, headers: auth() })) as unknown as any[])
      .find((r2) => r2.id === contactId).score;
    expect(after).toBe(before);
  });

  it("refuses to distribute when no rules are configured", async () => {
    // Silently reshuffling ownership with no rule to justify it would be worse than a 400.
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/leads/distribute`, headers: auth(),
      payload: { dryRun: true, contactIds: [contactId] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("previews a distribution without assigning anything when dryRun is set", async () => {
    const rule = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/distribution-rules`, headers: auth(),
      payload: {
        name: "All leads round-robin", position: 0, enabled: true,
        conditions: [], strategy: "round_robin", targetUserIds: [ownerUserId],
      },
    });
    expect(rule.statusCode).toBeLessThan(300);

    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/leads/distribute`, headers: auth(),
      payload: { dryRun: true, contactIds: [contactId] },
    });
    expect(res.statusCode).toBeLessThan(300);
    const out = body(res);
    expect(out.dryRun).toBe(true);
    expect(out.considered).toBe(1);
    expect(out.assignments.length).toBe(1);
    expect(out.assignments[0].userId).toBe(ownerUserId);

    // dryRun must not write: the contact keeps whatever owner it already had.
    const before = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts`, headers: auth() })) as unknown as any[])
      .find((c) => c.id === contactId);

    const again = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/leads/distribute`, headers: auth(),
      payload: { dryRun: true, contactIds: [contactId] },
    });
    expect(again.statusCode).toBeLessThan(300);

    const after = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts`, headers: auth() })) as unknown as any[])
      .find((c) => c.id === contactId);
    expect(after.ownerId).toBe(before.ownerId);

    // And the round-robin cursor must not have advanced either.
    const rules = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/distribution-rules`, headers: auth() })) as unknown as any[];
    expect(rules[0].cursor).toBe(0);
  });

  it("assigns for real when dryRun is off, and advances the cursor", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/leads/distribute`, headers: auth(),
      payload: { contactIds: [contactId] },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(body(res).dryRun).toBe(false);

    const after = (body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/contacts`, headers: auth() })) as unknown as any[])
      .find((c) => c.id === contactId);
    expect(after.ownerId).toBe(ownerUserId);

    const rules = body(await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/distribution-rules`, headers: auth() })) as unknown as any[];
    expect(rules[0].cursor).toBe(1);
  });

  it("reports conversion rates per source", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/leads/sources`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const rows = body(res) as unknown as any[];
    expect(rows.some((r) => r.source === "ads")).toBe(true);
  });
});

describe("quotes", () => {
  let quoteId = "";

  it("recomputes totals server-side from the line items", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/quotes`, headers: auth(),
      payload: {
        title: "Annual plan", contactId, taxPercent: 18, discountPaise: 50_000,
        // 2 x 500000 + 1 x 150000 = 1,150,000 paise subtotal
        items: [
          { description: "Seats", quantity: 2, unitPricePaise: 500_000 },
          { description: "Onboarding", quantity: 1, unitPricePaise: 150_000 },
        ],
        // A client trying to dictate the total must be ignored.
        totalPaise: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    const q = body(res);
    quoteId = q.id;
    expect(q.number).toBe(1);
    expect(q.subtotalPaise).toBe(1_150_000);
    // taxable = 1,150,000 - 50,000 = 1,100,000 → tax 18% = 198,000 → total 1,298,000
    expect(q.taxPaise).toBe(198_000);
    expect(q.totalPaise).toBe(1_298_000);
  });

  it("rejects a quote with no title", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/quotes`, headers: auth(), payload: { items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns the line items with the quote", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/quotes/${quoteId}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const q = body(res);
    expect(q.items.length).toBe(2);
    expect(q.items[0].position).toBe(0);
  });

  it("re-totals when the items change", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/v1/orgs/${orgId}/quotes/${quoteId}`, headers: auth(),
      payload: { taxPercent: 0, discountPaise: 0, items: [{ description: "Seats", quantity: 1, unitPricePaise: 500_000 }] },
    });
    expect(res.statusCode).toBeLessThan(300);
    const q = body(res);
    expect(q.subtotalPaise).toBe(500_000);
    expect(q.taxPaise).toBe(0);
    expect(q.totalPaise).toBe(500_000);
  });
});

describe("appointments", () => {
  let apptId = "";

  it("creates and lists an appointment, joined to its contact", async () => {
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/appointments`, headers: auth(),
      payload: { title: "Product demo", contactId, startsAt, durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(201);
    apptId = body(res).id;
    expect(body(res).status).toBe("scheduled");

    const list = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/appointments`, headers: auth() });
    expect(list.statusCode).toBe(200);
    const row = (body(list) as unknown as any[]).find((a) => a.id === apptId);
    expect(row).toBeTruthy();
    expect(row.contactName).toBe("Aarti Menon");
  });

  it("requires a title and a start time", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/appointments`, headers: auth(),
      payload: { title: "No start time" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates an appointment's status", async () => {
    const res = await app.inject({
      method: "PATCH", url: `/v1/orgs/${orgId}/appointments/${apptId}`, headers: auth(),
      payload: { status: "completed" },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(body(res).status).toBe("completed");
  });
});

describe("surveys", () => {
  let surveyId = "";

  it("creates a CSAT survey", async () => {
    const res = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/surveys`, headers: auth(),
      payload: { name: "Post-resolution CSAT", kind: "csat", question: "How did we do? Reply 1-5." },
    });
    expect(res.statusCode).toBe(201);
    surveyId = body(res).id;
    expect(surveyId).toBeTruthy();
  });

  it("reports an empty rollup before any responses arrive", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/csat`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const out = body(res);
    // No responses yet — the rollup must be well-formed rather than NaN or a crash.
    expect(out).toBeTruthy();
    expect(Number.isNaN(Number(out.average ?? 0))).toBe(false);
  });

  it("keeps CSAT and NPS on their own scales in the rollup", async () => {
    // Regression: averaging a 0-10 NPS score into a /5 CSAT average produced an
    // "Average CSAT 6 / 5" and a 120% ring on the surveys screen.
    const nps = await app.inject({
      method: "POST", url: `/v1/orgs/${orgId}/surveys`, headers: auth(),
      payload: { name: "Quarterly NPS", kind: "nps", question: "0-10, how likely?" },
    });
    expect(nps.statusCode).toBe(201);

    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/csat`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const out = body(res);
    // Whatever the data, a CSAT average can never exceed its own 5-point scale.
    expect(out.averageScore).toBeLessThanOrEqual(5);
    expect(out).toHaveProperty("csatAnswered");
    expect(out).toHaveProperty("npsAnswered");
    // NPS is null until an NPS survey is actually answered, never 0-by-accident.
    expect(out.nps).toBeNull();
  });

  it("lists a survey with its response counters", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/orgs/${orgId}/surveys`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const s = (body(res) as unknown as any[]).find((x) => x.id === surveyId);
    expect(s).toBeTruthy();
    expect(Number(s.sent ?? 0)).toBe(0);
  });
});

describe("contact timeline", () => {
  it("merges every source into one ISO-timestamped stream", async () => {
    const res = await app.inject({
      method: "GET", url: `/v1/orgs/${orgId}/contacts/${contactId}/timeline`, headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const out = body(res);
    expect(out.contact.id).toBe(contactId);
    const items = out.entries as any[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const kinds = new Set(items.map((i) => i.kind));
    // This contact has a ticket, a quote and an appointment by now.
    expect(kinds.has("ticket")).toBe(true);
    expect(kinds.has("quote")).toBe(true);
    expect(kinds.has("appointment")).toBe(true);

    // Timestamps must be ISO 8601, not Date.toString() — the web client parses these.
    for (const i of items) {
      expect(i.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    // Newest first.
    const times = items.map((i) => new Date(i.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    // counts must agree with the stream it summarises.
    for (const [kind, n] of Object.entries(out.counts as Record<string, number>)) {
      expect(items.filter((i) => i.kind === kind).length).toBe(n);
    }
  });

  it("404s for a contact that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/orgs/${orgId}/contacts/00000000-0000-0000-0000-0000000000aa/timeline`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});
