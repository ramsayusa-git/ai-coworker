import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgs, users } from "../db/schema.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const auth = req.authUser!;
    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    const [org] = await db.select().from(orgs).where(eq(orgs.id, auth.orgId));
    if (!user || !org) return reply.status(404).send({ error: "not found" });
    return { userId: user.id, email: user.email, name: user.name, orgId: org.id, orgName: org.name, role: auth.role };
  });
}
