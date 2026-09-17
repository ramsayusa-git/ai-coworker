import type { FastifyInstance } from "fastify";
import { requireCapability } from "../rbac.js";
import { ISOLATION_TIERS, type Isolation } from "../db/tenancy.js";
import {
  tenancyStatus, provisionSchema, provisionDatabase, provisionApp,
  migrateToSchemaIsolation, isStrongerIsolation,
} from "../services/provisioning.js";

export async function tenancyRoutes(app: FastifyInstance) {
  // What tier this org runs at, and what it could move up to.
  app.get("/orgs/:orgId/tenancy", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const status = await tenancyStatus(orgId);
    if (!status) return reply.code(404).send({ error: "not found" });
    return status;
  });

  // Moving a tenant's data between isolation tiers.
  //
  // Gated on manage_billing (owner-only) rather than manage_settings: this provisions
  // infrastructure and changes what the customer is charged for.
  app.post("/orgs/:orgId/tenancy", { preHandler: requireCapability("manage_billing") }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const b = req.body as { isolation?: string; migrateData?: boolean; secretRef?: string };

    const target = b?.isolation as Isolation;
    if (!ISOLATION_TIERS.includes(target)) {
      return reply.code(400).send({ error: `isolation must be one of: ${ISOLATION_TIERS.join(", ")}` });
    }

    const current = await tenancyStatus(orgId);
    if (!current) return reply.code(404).send({ error: "not found" });
    if (current.isolation === target) return { ...current, unchanged: true };

    // Downgrades move data back into a shared database. That is a data-exposure decision,
    // not a settings change, so it is refused here and left to a deliberate operator task.
    if (!isStrongerIsolation(target, current.isolation)) {
      return reply.code(409).send({
        error: `Refusing to move from "${current.isolation}" to the weaker tier "${target}". ` +
               `Downgrading puts tenant rows back into shared storage and must be done by an operator.`,
      });
    }

    if (target === "schema") {
      return b?.migrateData ? migrateToSchemaIsolation(orgId) : provisionSchema(orgId);
    }
    if (target === "database") return provisionDatabase(orgId, { secretRef: b?.secretRef });
    return provisionApp(orgId, { secretRef: b?.secretRef });
  });
}
