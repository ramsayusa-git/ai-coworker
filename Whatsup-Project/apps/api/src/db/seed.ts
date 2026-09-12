import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./client.js";
import { partners, orgs, users, orgMembers, channels, contacts, templates, conversations, messages, bots } from "./schema.js";

const ago = (m: number) => new Date(Date.now() - m * 60_000);
const ahead = (h: number) => new Date(Date.now() + h * 3_600_000);

async function main() {
  const [partner] = await db.insert(partners).values({ name: "Direct", slug: "direct" }).returning();
  const [org] = await db.insert(orgs).values({ partnerId: partner.id, name: "Aetos Store", planId: "growth", walletPaise: 428000 }).returning();
  const devPassword = process.env.SEED_PASSWORD || "Whatsup@Dev2026";
  const passwordHash = await bcrypt.hash(devPassword, 10);
  const [user] = await db.insert(users).values({ email: "ramsay.usa@gmail.com", name: "Ramsay", passwordHash }).returning();
  console.log(`Seeded login: ${user.email} / ${devPassword}  (CHANGE THIS before any real deployment)`);
  await db.insert(orgMembers).values({ orgId: org.id, userId: user.id, role: "org_owner" });

  const [metaCh] = await db.insert(channels).values({
    orgId: org.id, provider: "meta", displayName: "Aetos Store (Official)",
    phoneE164: "+919000000000", status: "connected", qualityRating: "green",
  }).returning();
  await db.insert(channels).values({
    orgId: org.id, provider: "whapi", displayName: "Sales +91 90000 00001",
    phoneE164: "+919000000001", status: "connected", safetyScore: 92, warmupDay: 14,
  });

  const [priya, arjun, sneha] = await db.insert(contacts).values([
    { orgId: org.id, name: "Priya Sharma", phoneE164: "+919876543210", tags: ["lead", "delhi"], stage: "lead" },
    { orgId: org.id, name: "Arjun Mehta", phoneE164: "+919123456789", tags: ["customer"], stage: "customer" },
    { orgId: org.id, name: "Sneha Iyer", phoneE164: "+919988776655", tags: ["vip", "repeat"], stage: "vip" },
  ]).returning();

  await db.insert(templates).values([
    { orgId: org.id, name: "order_confirmation", category: "utility", status: "approved",
      body: "Hi {{1}}, your order #{{2}} is confirmed and will arrive by {{3}}.", variables: ["name", "order_id", "eta"] },
    { orgId: org.id, name: "diwali_sale_2026", category: "marketing", status: "approved",
      body: "🎉 {{1}}, our Diwali Sale is live! Flat {{2}}% off. Shop now: {{3}}", variables: ["name", "discount", "link"] },
  ]);

  const [conv1] = await db.insert(conversations).values({
    orgId: org.id, channelId: metaCh.id, contactId: priya.id, status: "open", unread: 2,
    lastMessage: "Is the 2kW inverter in stock?", lastMessageAt: ago(3), serviceWindowExpiresAt: ahead(23),
  }).returning();
  const [conv2] = await db.insert(conversations).values({
    orgId: org.id, channelId: metaCh.id, contactId: arjun.id, status: "open", unread: 0,
    lastMessage: "Thanks, order placed.", lastMessageAt: ago(41), serviceWindowExpiresAt: ahead(22),
  }).returning();
  const [conv3] = await db.insert(conversations).values({
    orgId: org.id, channelId: metaCh.id, contactId: sneha.id, status: "pending", unread: 1,
    lastMessage: "Can you share the GST invoice?", lastMessageAt: ago(120), serviceWindowExpiresAt: ahead(20),
  }).returning();

  await db.insert(messages).values([
    { orgId: org.id, conversationId: conv1.id, channelId: metaCh.id, direction: "in", body: "Hi, I saw your ad on Facebook.", status: "read", createdAt: ago(9) },
    { orgId: org.id, conversationId: conv1.id, channelId: metaCh.id, direction: "out", body: "Hello Priya! Welcome to Aetos Store. How can we help?", status: "read", createdAt: ago(7) },
    { orgId: org.id, conversationId: conv1.id, channelId: metaCh.id, direction: "in", body: "Is the 2kW inverter in stock?", status: "read", createdAt: ago(3) },
    { orgId: org.id, conversationId: conv2.id, channelId: metaCh.id, direction: "out", body: "Your order #1042 is confirmed.", status: "delivered", createdAt: ago(45) },
    { orgId: org.id, conversationId: conv2.id, channelId: metaCh.id, direction: "in", body: "Thanks, order placed.", status: "read", createdAt: ago(41) },
    { orgId: org.id, conversationId: conv3.id, channelId: metaCh.id, direction: "in", body: "Can you share the GST invoice?", status: "read", createdAt: ago(120) },
  ]);

  await db.insert(bots).values([
    {
      orgId: org.id, name: "New Lead Welcome", enabled: true, channelIds: [metaCh.id],
      triggerSummary: "New conversation, no agent online",
      nodes: [
        { id: "n1", type: "trigger", label: "New conversation", detail: "Trigger: first inbound message", x: 40, y: 40 },
        { id: "n2", type: "message", label: "Greet + menu", detail: "Hi! Are you looking to (1) Buy (2) Support (3) Talk to a human?", x: 40, y: 160 },
        { id: "n3", type: "condition", label: "Branch on reply", detail: "1 -> Catalog, 2 -> AI agent, 3 -> Handoff", x: 40, y: 280 },
        { id: "n4", type: "ai", label: "AI agent (support)", detail: "RAG over product KB, confidence < 0.6 -> handoff", x: 260, y: 280 },
        { id: "n5", type: "handoff", label: "Assign to Sales team", detail: "Round-robin, SLA 15 min", x: 480, y: 280 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4", label: "2" }, { from: "n3", to: "n5", label: "3" }],
    },
    {
      orgId: org.id, name: "Order Status Lookup", enabled: true, channelIds: [metaCh.id],
      triggerSummary: "Keyword: order, track, status",
      nodes: [
        { id: "n1", type: "trigger", label: "Keyword match", detail: "\"order\" / \"track\" / \"status\"", x: 40, y: 40 },
        { id: "n2", type: "message", label: "Ask for order ID", detail: "Sure! What's your order number?", x: 40, y: 160 },
        { id: "n3", type: "ai", label: "Lookup order (tool)", detail: "HTTP node -> orders API -> format reply", x: 40, y: 280 },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
    },
  ]);

  console.log("Seeded org:", org.id, "channel:", metaCh.id);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
