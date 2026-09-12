import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { withOrgDb } from "../db/client.js";
import { teams, teamMembers, users, orgMembers } from "../db/schema.js";
import { requireCapability } from "../rbac.js";

// Wati-style "Teams" — a named group of agents a conversation or routing rule can be
// handed to, distinct from any one person's individual role. Membership is org-scoped
// (you can only add users who are actual org_members of this org).
export async function teamsRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/teams", async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrgDb(orgId, async (db) => {
      const rows = await db.select().from(teams).where(eq(teams.orgId, orgId));
      const out = [];
      for (const t of rows) {
        const members = await db.select({ userId: teamMembers.userId, name: users.name, email: users.email })
          .from(teamMembers).innerJoin(users, eq(teamMembers.userId, users.id))
          .where(eq(teamMembers.teamId, t.id));
        out.push({ ...t, members });
      }
      return out;
    });
  });

  app.post("/orgs/:orgId/teams", { preHandler: requireCapability("manage_team") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { name } = req.body as { name: string };
    if (!name?.trim()) return reply.status(400).send({ error: "name required" });
    const row = await withOrgDb(orgId, async (db) => {
      const [r] = await db.insert(teams).values({ orgId, name: name.trim() }).returning();
      return r;
    });
    return reply.status(201).send(row);
  });

  app.delete("/orgs/:orgId/teams/:id", { preHandler: requireCapability("manage_team") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    await withOrgDb(orgId, (db) => db.delete(teams).where(and(eq(teams.id, id), eq(teams.orgId, orgId))));
    return reply.status(204).send();
  });

  app.post("/orgs/:orgId/teams/:id/members", { preHandler: requireCapability("manage_team") }, async (req, reply) => {
    const { orgId, id } = req.params as { orgId: string; id: string };
    const { userId } = req.body as { userId: string };
    const result = await withOrgDb(orgId, async (db) => {
      const [team] = await db.select().from(teams).where(and(eq(teams.id, id), eq(teams.orgId, orgId)));
      if (!team) return null;
      const [member] = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
      if (!member) return "not_org_member";
      const [row] = await db.insert(teamMembers).values({ orgId, teamId: id, userId }).onConflictDoNothing().returning();
      return row ?? { teamId: id, userId };
    });
    if (result === null) return reply.status(404).send({ error: "team not found" });
    if (result === "not_org_member") return reply.status(400).send({ error: "user is not a member of this org" });
    return reply.status(201).send(result);
  });

  app.delete("/orgs/:orgId/teams/:id/members/:userId", { preHandler: requireCapability("manage_team") }, async (req, reply) => {
    const { id, userId } = req.params as { orgId: string; id: string; userId: string };
    await withOrgDb((req.params as { orgId: string }).orgId, (db) =>
      db.delete(teamMembers).where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)))
    );
    return reply.status(204).send();
  });
}
