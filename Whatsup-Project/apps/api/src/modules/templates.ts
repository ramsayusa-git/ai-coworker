import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { templates } from "../db/schema.js";

export async function templatesRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/templates", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, (db) =>
      db.select().from(templates).where(eq(templates.orgId, orgId)).orderBy(desc(templates.updatedAt))
    );
  });

  app.post("/orgs/:orgId/templates", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const body = req.body as { name: string; category: string; body: string; language?: string };
    if (!body.name?.trim() || !body.body?.trim()) {
      return reply.status(400).send({ error: "name and body required" });
    }
    const vars = Array.from(body.body.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(templates).values({
        orgId, name: body.name.trim(), category: body.category ?? "utility",
        language: body.language ?? "en", body: body.body.trim(), variables: vars, status: "pending",
      }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });
}
