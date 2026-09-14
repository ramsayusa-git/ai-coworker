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
  manage_deals: ["org_owner", "org_admin", "supervisor", "agent"],
  manage_companies: ["org_owner", "org_admin", "supervisor", "agent"],
  manage_tasks: ["org_owner", "org_admin", "supervisor", "agent"],
  assign_conversations: ["org_owner", "org_admin", "supervisor"],
  send_messages: ["org_owner", "org_admin", "supervisor", "agent"],
  update_conversation_status: ["org_owner", "org_admin", "supervisor", "agent"],
  manage_automations: ["org_owner", "org_admin", "supervisor"],
  manage_ads: ["org_owner", "org_admin"],
} as const;

export type Capability = keyof typeof CAPABILITIES;

// Wati-style multi-select functional roles: a user picks any combination of these in
// addition to their single hierarchical `role` above. Purely additive — a functional role
// can only GRANT a capability the ladder wouldn't otherwise give that user, never take one
// away. "dashboard_viewer" grants nothing here on purpose: every role can already read
// dashboards/analytics (see the comment on requireCapability below), so it's a label only.
export const FUNCTIONAL_ROLES = [
  "administrator", "broadcast_manager", "template_manager", "contact_manager",
  "operator", "developer", "billing_manager", "dashboard_viewer",
] as const;
export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];

const FUNCTIONAL_ROLE_CAPS: Record<FunctionalRole, Capability[]> = {
  administrator: Object.keys(CAPABILITIES) as Capability[],
  broadcast_manager: ["manage_campaigns", "send_messages", "manage_ads"],
  template_manager: ["manage_templates"],
  contact_manager: ["manage_contacts", "manage_deals", "manage_companies", "manage_tasks"],
  operator: ["send_messages", "update_conversation_status", "assign_conversations"],
  developer: ["manage_channels", "manage_settings"],
  billing_manager: ["manage_billing"],
  dashboard_viewer: [],
};

// Use as a route's `preHandler` (after the scoped authenticate+requireOrgMatch hook already
// applied in server.ts) — 403s unless the caller's JWT role OR one of their functionalRoles
// grants this capability. Read (GET) routes stay ungated everywhere: every org role, viewer
// included, can see inbox/analytics per the RBAC matrix ("viewer: read-only across inbox and
// analytics") — functional roles never need to grant read access, only these write actions.
export function requireCapability(cap: Capability) {
  const allowedRoles: readonly string[] = CAPABILITIES[cap];
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.authUser?.role;
    const functionalRoles = req.authUser?.functionalRoles ?? [];
    const grantedByLadder = !!role && allowedRoles.includes(role);
    const grantedByFunctional = functionalRoles.some((fr) => FUNCTIONAL_ROLE_CAPS[fr as FunctionalRole]?.includes(cap));
    if (!grantedByLadder && !grantedByFunctional) {
      reply.status(403).send({ error: `Forbidden — requires role: ${allowedRoles.join(", ")} (or an equivalent functional role)` });
    }
  };
}
