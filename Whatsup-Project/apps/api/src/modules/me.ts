import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgs, users, partners } from "../db/schema.js";

type Brand = { brandName: string; logoUrl: string | null; faviconUrl: string | null; footerText: string | null; primaryColor: string };
const DEFAULT_BRAND: Brand = { brandName: "Aetos One Chat", logoUrl: null, faviconUrl: null, footerText: null, primaryColor: "#059669" };

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const auth = req.authUser!;
    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    const [org] = await db.select().from(orgs).where(eq(orgs.id, auth.orgId));
    if (!user || !org) return reply.status(404).send({ error: "not found" });

    // White-label: if this org belongs to a REAL white-label partner (not the system
    // "direct"/billingMode=="direct" bucket every non-reseller org sits under), the
    // partner's brand (logo/favicon/footer/colors) overrides the platform default
    // everywhere the signed-in app renders it. A direct-billed partner with no branding
    // set of its own must never leak its internal partner *name* onto the customer's UI.
    let partnerBrand = DEFAULT_BRAND;
    if (org.partnerId) {
      const [partner] = await db.select().from(partners).where(eq(partners.id, org.partnerId));
      if (partner && partner.billingMode !== "direct") {
        const brand = (partner.brand as Record<string, unknown>) ?? {};
        partnerBrand = {
          brandName: (brand.brandName as string) || partner.name || DEFAULT_BRAND.brandName,
          logoUrl: (brand.logoUrl as string) || null,
          faviconUrl: (brand.faviconUrl as string) || null,
          footerText: (brand.footerText as string) || null,
          primaryColor: (brand.primaryColor as string) || DEFAULT_BRAND.primaryColor,
        };
      }
    }
    return { userId: user.id, email: user.email, name: user.name, orgId: org.id, orgName: org.name, role: auth.role, brand: partnerBrand };
  });
}
