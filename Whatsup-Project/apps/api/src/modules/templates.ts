import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { templates } from "../db/schema.js";
import { buildMetaInteractive } from "../adapters/meta.js";
import { requireCapability } from "../rbac.js";

// Every writable column, so POST and PATCH stay in step as the interactive model grows.
const WRITABLE = [
  "name", "category", "language", "channel", "body",
  "headerType", "headerText", "headerMediaUrl", "footer",
  "interactiveType", "buttons", "listButtonText", "listSections",
  "catalogId", "catalogSections", "flowId", "flowCtaText",
] as const;

function pick(src: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

// Meta's own limits — enforced here so a template can't be built in the UI that Meta
// would reject at send time.
function validateInteractive(t: Record<string, any>): string | null {
  const type = t.interactiveType ?? "none";
  const buttons = (t.buttons ?? []) as Array<{ kind: string; text: string; url?: string; phone?: string }>;
  if (type === "buttons") {
    if (!buttons.length) return "Add at least one button, or set the interactive type back to None.";
    const quick = buttons.filter((b) => b.kind === "quick_reply");
    if (quick.length > 3) return "WhatsApp allows at most 3 quick-reply buttons.";
    if (buttons.filter((b) => b.kind === "url").length > 2) return "WhatsApp allows at most 2 URL buttons.";
    if (buttons.filter((b) => b.kind === "phone").length > 1) return "WhatsApp allows at most 1 call button.";
    for (const b of buttons) {
      if (!b.text?.trim()) return "Every button needs a label.";
      if (b.text.length > 20) return `Button label "${b.text}" is longer than WhatsApp's 20-character limit.`;
      if (b.kind === "url" && !b.url?.startsWith("http")) return `URL button "${b.text}" needs a full http(s) link.`;
      if (b.kind === "phone" && !b.phone?.trim()) return `Call button "${b.text}" needs a phone number.`;
    }
  }
  if (type === "list") {
    const sections = (t.listSections ?? []) as Array<{ rows: unknown[] }>;
    const rows = sections.reduce((n, s) => n + (s.rows?.length ?? 0), 0);
    if (!rows) return "A list message needs at least one row.";
    if (rows > 10) return "WhatsApp allows at most 10 rows across all list sections.";
  }
  if (type === "catalog") {
    if (!t.catalogId?.trim()) return "A catalogue message needs your Meta catalogue ID.";
    const items = ((t.catalogSections ?? []) as Array<{ productRetailerIds: string[] }>)
      .reduce((n, s) => n + (s.productRetailerIds?.length ?? 0), 0);
    if (!items) return "Add at least one product (retailer ID) to the catalogue message.";
  }
  if (type === "flow" && !t.flowId) return "Pick a published Flow to attach, or change the interactive type.";
  return null;
}

export async function templatesRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/templates", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(templates).where(eq(templates.orgId, orgId)).orderBy(desc(templates.updatedAt))
    );
  });

  app.post("/orgs/:orgId/templates", { preHandler: requireCapability("manage_templates") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as Record<string, any>;
    if (!body.name?.trim() || !body.body?.trim()) {
      return reply.status(400).send({ error: "name and body required" });
    }
    const invalid = validateInteractive(body);
    if (invalid) return reply.status(400).send({ error: invalid });

    const vars = Array.from(String(body.body).matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(templates).values({
        orgId,
        ...pick(body),
        name: body.name.trim(),
        category: body.category ?? "utility",
        language: body.language ?? "en",
        body: body.body.trim(),
        variables: vars,
        // SMS has no Meta review gate, so it is usable immediately; WhatsApp starts pending.
        status: body.channel === "sms" ? "approved" : "pending",
      } as any).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch("/orgs/:orgId/templates/:id", { preHandler: requireCapability("manage_templates") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const body = req.body as Record<string, any>;
    return withOrgDb(orgId, async (db) => {
      const [current] = await db.select().from(templates)
        .where(and(eq(templates.orgId, orgId), eq(templates.id, id))).limit(1);
      if (!current) return reply.status(404).send({ error: "not found" });

      const merged = { ...current, ...pick(body) } as Record<string, any>;
      const invalid = validateInteractive(merged);
      if (invalid) return reply.status(400).send({ error: invalid });

      const patch: Record<string, unknown> = { ...pick(body), updatedAt: new Date() };
      if (body.body) patch.variables = Array.from(String(body.body).matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
      // Any content change on a WhatsApp template means Meta must review it again.
      const contentChanged = ["body", "headerType", "headerText", "headerMediaUrl", "footer", "interactiveType", "buttons", "listSections", "catalogSections", "flowId"]
        .some((k) => body[k] !== undefined);
      if (contentChanged && current.channel !== "sms") patch.status = "pending";

      const [row] = await db.update(templates).set(patch)
        .where(and(eq(templates.orgId, orgId), eq(templates.id, id))).returning();
      return row;
    });
  });

  app.delete("/orgs/:orgId/templates/:id", { preHandler: requireCapability("manage_templates") }, async (req) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(templates)
      .where(and(eq(templates.orgId, orgId), eq(templates.id, id))));
    return { ok: true };
  });

  // The exact Meta `interactive` object this template would send — so what the UI
  // previews is the real payload, not a separate mock of it.
  app.get("/orgs/:orgId/templates/:id/preview", async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    return withOrgDb(orgId, async (db) => {
      const [t] = await db.select().from(templates)
        .where(and(eq(templates.orgId, orgId), eq(templates.id, id))).limit(1);
      if (!t) return reply.status(404).send({ error: "not found" });
      if (!t.interactiveType || t.interactiveType === "none") {
        return { type: "text", payload: { messaging_product: "whatsapp", type: "text", text: { body: t.body } } };
      }
      return {
        type: t.interactiveType,
        payload: {
          messaging_product: "whatsapp",
          type: "interactive",
          interactive: buildMetaInteractive({
            type: t.interactiveType, body: t.body,
            headerType: t.headerType ?? undefined, headerText: t.headerText ?? undefined,
            headerMediaUrl: t.headerMediaUrl ?? undefined, footer: t.footer ?? undefined,
            buttons: t.buttons ?? [], listButtonText: t.listButtonText ?? undefined,
            listSections: t.listSections ?? [], catalogId: t.catalogId ?? undefined,
            catalogSections: t.catalogSections ?? [], flowCtaText: t.flowCtaText ?? undefined,
            metaFlowId: "<flow id resolved at send time>",
          }),
        },
      };
    });
  });
}
