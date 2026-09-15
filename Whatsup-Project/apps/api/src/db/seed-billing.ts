import "dotenv/config";
import { db } from "./client.js";
import { plans, conversationRates } from "./schema.js";

// Plan tiers. priceMonthly/Quarterly/Annual are all the PER-MONTH price when billed on
// that cycle (the way the tier card is published), in paise.
const PLANS = [
  {
    id: "free", name: "Free Forever", tagline: "Packed with essentials", position: 0,
    priceMonthlyPaise: 0, priceQuarterlyPaise: 0, priceAnnualPaise: 0,
    limits: { agents: 1, chatbotTriggers: 10, channels: 1, webhookEndpoints: 0, apiKeys: 0 },
    features: {
      inbox: true, chatbot: true, contacts: true, ads_manager: true, blue_tick_assist: true,
      broadcast: true, interactive_messages: true,
      broadcast_scheduling: false, retargeting: false, flows: false, drip: false,
      template_send_api: false, developer_api: false, webhooks: false,
      multi_channel_inbox: false, dedicated_manager: false,
    },
    highlights: [
      "Free blue-tick verification assistance", "Rs 50 free conversation credits",
      "Inbox: WhatsApp", "Chatbot: unlimited sessions, 10 triggers", "Team inbox: 1 agent",
      "Click-to-WhatsApp Ads Manager", "Upload & manage contacts",
    ],
  },
  {
    id: "starter", name: "Starter", tagline: "Everything in Free, plus", position: 1,
    priceMonthlyPaise: 179900, priceQuarterlyPaise: 149900, priceAnnualPaise: 99900,
    limits: { agents: -1, chatbotTriggers: -1, channels: 3, webhookEndpoints: 0, apiKeys: 1 },
    features: {
      inbox: true, chatbot: true, contacts: true, ads_manager: true, blue_tick_assist: true,
      broadcast: true, interactive_messages: true,
      broadcast_scheduling: true, retargeting: true, flows: true, drip: false,
      template_send_api: true, developer_api: false, webhooks: false,
      multi_channel_inbox: false, dedicated_manager: false,
    },
    highlights: [
      "Team inbox: unlimited agents", "Chatbot: unlimited triggers",
      "Broadcast scheduling + retargeting", "WhatsApp Flows",
      "Template Send Message API", "Chat support",
    ],
  },
  {
    id: "advanced", name: "Advanced", tagline: "Everything in Starter, plus", position: 2,
    priceMonthlyPaise: 299900, priceQuarterlyPaise: 249900, priceAnnualPaise: 199900,
    limits: { agents: -1, chatbotTriggers: -1, channels: -1, webhookEndpoints: 10, apiKeys: 10 },
    features: {
      inbox: true, chatbot: true, contacts: true, ads_manager: true, blue_tick_assist: true,
      broadcast: true, interactive_messages: true,
      broadcast_scheduling: true, retargeting: true, flows: true, drip: true,
      template_send_api: true, developer_api: true, webhooks: true,
      multi_channel_inbox: true, dedicated_manager: true,
    },
    highlights: [
      "Dedicated relationship manager", "Drip campaigns", "Webhooks",
      "Inbox: WhatsApp, Facebook, Instagram & Email", "Full developer API access",
    ],
  },
];

// Conversation rates at Meta actuals, in MILLI-paise (Rs 0.865 = 86.5 paise = 86500).
// markupBps stays 0 everywhere — that IS the "no markup" promise, expressed as data.
// Service conversations are free (Meta removed service-conversation charges in Nov 2024).
const RATES = [
  { country: "India", countryCode: "IN", marketing: 86500, utility: 11500, auth: 11040 },
  { country: "Germany", countryCode: "DE", marketing: 1000000, utility: 403200, auth: 403200 },
  { country: "France", countryCode: "FR", marketing: 629900, utility: 219900, auth: 219900 },
  { country: "Russia", countryCode: "RU", marketing: 587600, utility: 293100, auth: 293100 },
  { country: "United States", countryCode: "US", marketing: 183100, utility: 24900, auth: 24900 },
  { country: "United Arab Emirates", countryCode: "AE", marketing: 366100, utility: 115000, auth: 115000 },
  { country: "United Kingdom", countryCode: "GB", marketing: 387400, utility: 161200, auth: 161200 },
  { country: "Brazil", countryCode: "BR", marketing: 52500, utility: 7500, auth: 7500 },
  { country: "Indonesia", countryCode: "ID", marketing: 344000, utility: 22400, auth: 22400 },
  { country: "Rest of World", countryCode: "ZZ", marketing: 550000, utility: 250000, auth: 250000 },
];

async function main() {
  for (const p of PLANS) {
    await db.insert(plans).values(p as any).onConflictDoUpdate({ target: plans.id, set: p as any });
  }
  for (const r of RATES) {
    const row = {
      country: r.country, countryCode: r.countryCode,
      marketingMilliPaise: r.marketing, utilityMilliPaise: r.utility,
      authenticationMilliPaise: r.auth, serviceMilliPaise: 0, markupBps: 0,
      updatedAt: new Date(),
    };
    await db.insert(conversationRates).values(row)
      .onConflictDoUpdate({ target: conversationRates.countryCode, set: row });
  }
  console.log(`Seeded ${PLANS.length} plans and ${RATES.length} country rates.`);
  process.exit(0);
}
main();
