import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type AuthUser = { userId: string; orgId: string; role: string; email: string };

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOrgMatch: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: process.env.JWT_SECRET! });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<AuthUser>();
      req.authUser = payload;
    } catch {
      reply.status(401).send({ error: "Unauthorized — missing or invalid token" });
    }
  });

  // Use after `authenticate` on routes shaped /orgs/:orgId/... — 403s if the token's org
  // doesn't match the URL's org, so one org can never read/write another's data.
  app.decorate("requireOrgMatch", async (req: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = req.params as { orgId?: string };
    if (orgId && req.authUser && orgId !== req.authUser.orgId) {
      reply.status(403).send({ error: "Forbidden — org mismatch" });
    }
  });
});
