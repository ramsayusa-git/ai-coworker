import type { FastifyReply, FastifyRequest } from "fastify";

// Org-scoped role ladder, per the architecture doc and the Settings > Roles & Permissions
// reference table in apps/web (RBAC_MATRIX). platform_admin/partner_* roles never carry an
// orgId that matches an /orgs/:orgId/* route, so they simply fall through to 403 here, which
// is correct — partner-level access to org data goes through the separate partner_access
// grant (see partners.ts), never through this ladder.
const CAPABILITIES = {
  manage_billing: ["org_owner"],
  manage_channels: ["org_owner", "org_admin"],
  manage_team: ["org_owner", "org_admin"],
  manage_settings: ["org_owner", "org_admin"],
  manage_templates: ["org_owner", "org_admin", "supervisor"],
  manage_campaigns: ["org_owner", "org_admin", "supervisor"],
  manage_bots: ["org_owner", "org_admin", "supervisor"],
  manage_contacts: ["org_owner", "org_admin", "supervisor", "agent"],
  assign_conversations: ["org_owner", "org_admin", "supervisor"],
  send_messages: ["org_owner", "org_admin", "supervisor", "agent"],
  update_conversation_status: ["org_owner", "org_admin", "supervisor", "agent"],
} as const;

export type Capability = keyof typeof CAPABILITIES;

// Use as a route's `preHandler` (after the scoped authenticate+requireOrgMatch hook already
// applied in server.ts) — 403s unless the caller's JWT role is allowed to do this. Read (GET)
// routes stay ungated everywhere: every org role, viewer included, can see inbox/analytics
// per the RBAC matrix ("viewer: read-only across inbox and analytics").
export function requireCapability(cap: Capability) {
  const allowed: readonly string[] = CAPABILITIES[cap];
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.authUser?.role;
    if (!role || !allowed.includes(role)) {
      reply.status(403).send({ error: `Forbidden — requires role: ${allowed.join(", ")}` });
    }
  };
}
