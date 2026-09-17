import "dotenv/config";
import { db } from "./client.js";
import { plans } from "./schema.js";

// Deployment editions. The same product, sold three ways x two audiences, every one
// of them fully white-labelled.
//
// PRICES ARE PLACEHOLDERS. Reseller tiers carry a platform fee so the UI has real
// numbers to render; enterprise tiers are customPricing (quoted, never listed). Change
// them in this file or straight in the `plans` table — nothing in the code hardcodes
// a price.
const WHITE_LABEL_CORE = {
  inbox: true, chatbot: true, contacts: true, ads_manager: true, blue_tick_assist: true,
  broadcast: true, interactive_messages: true, broadcast_scheduling: true, retargeting: true,
  flows: true, drip: true, template_send_api: true, developer_api: true, webhooks: true,
  multi_channel_inbox: true, dedicated_manager: true,
  white_label: true, custom_domain: true, partner_console: true,
};

const EDITIONS = [
  {
    id: "hosted_reseller", name: "Hosted · Reseller", tagline: "Sell our cloud under your brand",
    deployment: "hosted", audience: "reseller", position: 10, customPricing: false,
    priceMonthlyPaise: 999900, priceQuarterlyPaise: 849900, priceAnnualPaise: 699900,
    limits: { clientOrgs: -1, agents: -1, channels: -1, webhookEndpoints: 25, apiKeys: 25 },
    features: { ...WHITE_LABEL_CORE, wholesale_billing: true, rev_share: true },
    highlights: [
      "We run the infrastructure — you run the brand",
      "Unlimited client organisations from one partner console",
      "Your logo, colours, favicon and custom domain end to end",
      "Wholesale conversation rates with your own margin on top",
      "Client-owned WhatsApp Business Accounts — no lock-in",
      "Go live the same day, no servers to provision",
    ],
  },
  {
    id: "hosted_enterprise", name: "Hosted · Enterprise", tagline: "Our cloud, your governance",
    deployment: "hosted", audience: "enterprise", position: 11, customPricing: true,
    priceMonthlyPaise: 0, priceQuarterlyPaise: 0, priceAnnualPaise: 0,
    limits: { agents: -1, channels: -1, webhookEndpoints: -1, apiKeys: -1 },
    features: { ...WHITE_LABEL_CORE, sso: true, audit_log: true, uptime_sla: true },
    highlights: [
      "Fully white-labelled on your own domain",
      "SSO, role governance and an exportable audit trail",
      "Contracted uptime and support SLAs",
      "Data-residency choice and signed DPA",
      "Named technical account manager",
    ],
  },
  {
    id: "self_hosted_reseller", name: "Self-Hosted · Reseller", tagline: "Deploy on your own servers, resell at will",
    deployment: "self_hosted", audience: "reseller", position: 20, customPricing: false,
    priceMonthlyPaise: 1999900, priceQuarterlyPaise: 1749900, priceAnnualPaise: 1499900,
    limits: { clientOrgs: -1, agents: -1, channels: -1, instances: 3 },
    features: { ...WHITE_LABEL_CORE, source_access: false, license_issuing: true, air_gapped: true },
    highlights: [
      "Runs entirely on infrastructure you control",
      "Issue and revoke client licences from your own console",
      "No conversation data ever leaves your servers",
      "Full white-label, including the product name",
      "Works air-gapped — licences verify offline",
      "Docker Compose and Kubernetes deployment guides",
    ],
  },
  {
    id: "self_hosted_enterprise", name: "Self-Hosted · Enterprise", tagline: "Your data centre, your rules",
    deployment: "self_hosted", audience: "enterprise", position: 21, customPricing: true,
    priceMonthlyPaise: 0, priceQuarterlyPaise: 0, priceAnnualPaise: 0,
    limits: { agents: -1, channels: -1, instances: -1 },
    features: { ...WHITE_LABEL_CORE, sso: true, audit_log: true, air_gapped: true, escrow: true },
    highlights: [
      "Unlimited instances across your estate",
      "Air-gapped and on-premise installations supported",
      "SSO/SAML, audit logging, your own key management",
      "Source-code escrow available",
      "Security review, pen-test support and custom hardening",
    ],
  },
  {
    id: "dedicated_reseller", name: "Private Cloud · Reseller", tagline: "A single-tenant instance we operate for you",
    deployment: "dedicated", audience: "reseller", position: 30, customPricing: false,
    priceMonthlyPaise: 2999900, priceQuarterlyPaise: 2699900, priceAnnualPaise: 2399900,
    limits: { clientOrgs: -1, agents: -1, channels: -1, instances: 1 },
    features: { ...WHITE_LABEL_CORE, dedicated_infra: true, wholesale_billing: true, rev_share: true },
    highlights: [
      "Your own isolated instance, in the region you pick",
      "We handle deployment, upgrades, backups and monitoring",
      "Your brand and your domain, top to bottom",
      "Unlimited client organisations under your console",
      "Scheduled upgrade windows you control",
    ],
  },
  {
    id: "dedicated_enterprise", name: "Private Cloud · Enterprise", tagline: "Single-tenant, run to your SLA",
    deployment: "dedicated", audience: "enterprise", position: 31, customPricing: true,
    priceMonthlyPaise: 0, priceQuarterlyPaise: 0, priceAnnualPaise: 0,
    limits: { agents: -1, channels: -1, instances: -1 },
    features: { ...WHITE_LABEL_CORE, dedicated_infra: true, sso: true, audit_log: true, uptime_sla: true },
    highlights: [
      "Dedicated single-tenant infrastructure and database",
      "Region and data-residency of your choosing",
      "Contracted uptime, RTO/RPO and support SLAs",
      "VPC peering and private network options",
      "Named account and engineering escalation path",
    ],
  },
];

async function main() {
  // The three original tiers stay as they are — they are the hosted/direct ladder.
  for (const e of EDITIONS) {
    await db.insert(plans).values(e as any).onConflictDoUpdate({ target: plans.id, set: e as any });
  }
  console.log(`Seeded ${EDITIONS.length} deployment editions (3 deployments x reseller/enterprise).`);
  process.exit(0);
}
main();
