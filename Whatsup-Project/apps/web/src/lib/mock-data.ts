import type { Contact, Conversation, Message } from "./types";

const now = Date.now();
const ago = (m: number) => new Date(now - m * 60_000).toISOString();
const ahead = (h: number) => new Date(now + h * 3_600_000).toISOString();

export const contacts: Contact[] = [
  { id: "c1", name: "Priya Sharma", phone: "+91 98765 43210", tags: ["lead", "delhi"] },
  { id: "c2", name: "Arjun Mehta", phone: "+91 91234 56789", tags: ["customer"] },
  { id: "c3", name: "Sneha Iyer", phone: "+91 99887 76655", tags: ["vip", "repeat"] },
  { id: "c4", name: "Rahul Verma", phone: "+91 90000 11111", tags: [] },
  { id: "c5", name: "Fatima Khan", phone: "+91 88888 22222", tags: ["support"] },
];

const meta = { id: "ch1", name: "Aetos Store (Official)", provider: "meta" as const };
const whapi = { id: "ch2", name: "Sales +91 90000 00001", provider: "whapi" as const };

export const conversations: Conversation[] = [
  { id: "v1", contact: contacts[0], channel: meta, status: "open", assignee: null, unread: 2,
    lastMessage: "Is the 2kW inverter in stock?", lastMessageAt: ago(3), serviceWindowExpiresAt: ahead(23) },
  { id: "v2", contact: contacts[1], channel: whapi, status: "open", assignee: "Ramsay", unread: 0,
    lastMessage: "Thanks, order placed.", lastMessageAt: ago(41), serviceWindowExpiresAt: ahead(22) },
  { id: "v3", contact: contacts[2], channel: meta, status: "pending", assignee: "Ramsay", unread: 1,
    lastMessage: "Can you share the GST invoice?", lastMessageAt: ago(120), serviceWindowExpiresAt: ahead(20) },
  { id: "v4", contact: contacts[3], channel: whapi, status: "snoozed", assignee: null, unread: 0,
    lastMessage: "Will call back tomorrow", lastMessageAt: ago(900), serviceWindowExpiresAt: ahead(-2) },
  { id: "v5", contact: contacts[4], channel: meta, status: "resolved", assignee: "Support", unread: 0,
    lastMessage: "Resolved, thank you!", lastMessageAt: ago(2000), serviceWindowExpiresAt: ahead(-10) },
];

export const messages: Message[] = [
  { id: "m1", conversationId: "v1", direction: "in", body: "Hi, I saw your ad on Facebook.", status: "read", createdAt: ago(9) },
  { id: "m2", conversationId: "v1", direction: "out", body: "Hello Priya! Welcome to Aetos Store. How can we help?", status: "read", createdAt: ago(7) },
  { id: "m3", conversationId: "v1", direction: "in", body: "Is the 2kW inverter in stock?", status: "read", createdAt: ago(3) },
  { id: "m4", conversationId: "v2", direction: "out", body: "Your order #1042 is confirmed.", status: "delivered", createdAt: ago(45) },
  { id: "m5", conversationId: "v2", direction: "in", body: "Thanks, order placed.", status: "read", createdAt: ago(41) },
  { id: "m6", conversationId: "v3", direction: "in", body: "Can you share the GST invoice?", status: "read", createdAt: ago(120) },
  { id: "m7", conversationId: "v4", direction: "in", body: "Will call back tomorrow", status: "read", createdAt: ago(900) },
  { id: "m8", conversationId: "v5", direction: "in", body: "Resolved, thank you!", status: "read", createdAt: ago(2000) },
];

import type { ContactFull, Channel } from "./types";

export const contactsFull: ContactFull[] = [
  { id: "c1", name: "Priya Sharma", phone: "+91 98765 43210", tags: ["lead", "delhi"], stage: "lead", optIn: true, email: "priya.sharma@example.com", createdAt: ago(60 * 24 * 3), lastContactedAt: ago(3) },
  { id: "c2", name: "Arjun Mehta", phone: "+91 91234 56789", tags: ["customer"], stage: "customer", optIn: true, email: "arjun.m@example.com", createdAt: ago(60 * 24 * 30), lastContactedAt: ago(41) },
  { id: "c3", name: "Sneha Iyer", phone: "+91 99887 76655", tags: ["vip", "repeat"], stage: "vip", optIn: true, email: "sneha.iyer@example.com", createdAt: ago(60 * 24 * 90), lastContactedAt: ago(120) },
  { id: "c4", name: "Rahul Verma", phone: "+91 90000 11111", tags: [], stage: "lead", optIn: false, createdAt: ago(60 * 24 * 1), lastContactedAt: ago(900) },
  { id: "c5", name: "Fatima Khan", phone: "+91 88888 22222", tags: ["support"], stage: "customer", optIn: true, email: "fatima.k@example.com", createdAt: ago(60 * 24 * 60), lastContactedAt: ago(2000) },
  { id: "c6", name: "Vikram Nair", phone: "+91 97000 33333", tags: ["lead"], stage: "lead", optIn: true, createdAt: ago(60 * 24 * 0.5), lastContactedAt: ago(4000) },
  { id: "c7", name: "Anita Desai", phone: "+91 96000 44444", tags: ["customer", "mumbai"], stage: "customer", optIn: true, email: "anita.d@example.com", createdAt: ago(60 * 24 * 45), lastContactedAt: ago(60) },
];

export const channels: Channel[] = [
  { id: "ch1", provider: "meta", displayName: "Aetos Store (Official)", phone: "+91 90000 00000", status: "connected", qualityRating: "green", messageLimitTier: "10K/day", connectedAt: ago(60 * 24 * 20) },
  { id: "ch2", provider: "whapi", displayName: "Sales +91 90000 00001", phone: "+91 90000 00001", status: "connected", safetyScore: 92, warmupDay: 14, connectedAt: ago(60 * 24 * 5) },
];

import type { Template, Broadcast } from "./types";

export const templates: Template[] = [
  { id: "t1", name: "order_confirmation", language: "en", category: "utility", status: "approved",
    body: "Hi {{1}}, your order #{{2}} is confirmed and will arrive by {{3}}.", variables: ["name", "order_id", "eta"],
    quality: "green", updatedAt: ago(60 * 24 * 10) },
  { id: "t2", name: "diwali_sale_2026", language: "en", category: "marketing", status: "approved",
    body: "🎉 {{1}}, our Diwali Sale is live! Flat {{2}}% off on all inverters. Shop now: {{3}}", variables: ["name", "discount", "link"],
    quality: "yellow", updatedAt: ago(60 * 24 * 2) },
  { id: "t3", name: "otp_login", language: "en", category: "authentication", status: "approved",
    body: "{{1}} is your Aetos Store verification code. Valid for 5 minutes.", variables: ["otp"],
    quality: "green", updatedAt: ago(60 * 24 * 30) },
  { id: "t4", name: "abandoned_cart_reminder", language: "en", category: "marketing", status: "pending",
    body: "Hey {{1}}, you left {{2}} in your cart. Complete your order before stock runs out!", variables: ["name", "product"],
    updatedAt: ago(60 * 6) },
  { id: "t5", name: "cod_confirmation", language: "en", category: "utility", status: "rejected",
    body: "Confirm your COD order #{{1}} by replying YES.", variables: ["order_id"],
    rejectionReason: "Category mismatch — reclassify as Utility with explicit opt-out language.", updatedAt: ago(60 * 24 * 1) },
];

export const broadcasts: Broadcast[] = [
  { id: "b1", name: "Diwali Sale Blast", templateId: "t2", segment: "All opted-in contacts", audienceCount: 4820,
    status: "completed", scheduledAt: ago(60 * 24 * 3), stats: { sent: 4820, delivered: 4690, read: 3102, failed: 130 }, createdAt: ago(60 * 24 * 4) },
  { id: "b2", name: "Cart Recovery — Sep", templateId: "t4", segment: "Cart abandoned (7d)", audienceCount: 312,
    status: "sending", scheduledAt: ago(30), stats: { sent: 180, delivered: 165, read: 90, failed: 6 }, createdAt: ago(60) },
  { id: "b3", name: "New Stock Announcement", templateId: "t2", segment: "Delhi leads", audienceCount: 240,
    status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000 * 20).toISOString(), stats: { sent: 0, delivered: 0, read: 0, failed: 0 }, createdAt: ago(120) },
  { id: "b4", name: "VIP Early Access", templateId: "t2", segment: "VIP customers", audienceCount: 58,
    status: "draft", scheduledAt: null, stats: { sent: 0, delivered: 0, read: 0, failed: 0 }, createdAt: ago(200) },
];

import type { Bot, AnalyticsSummary } from "./types";

export const bots: Bot[] = [
  {
    id: "bot1", name: "New Lead Welcome", enabled: true, channels: ["ch1"],
    triggerSummary: "New conversation, no agent online", sessionsToday: 34, handoffRate: 0.18,
    updatedAt: ago(60 * 24 * 2),
    nodes: [
      { id: "n1", type: "trigger", label: "New conversation", detail: "Trigger: first inbound message", x: 40, y: 40 },
      { id: "n2", type: "message", label: "Greet + menu", detail: "\"Hi! Are you looking to (1) Buy (2) Support (3) Talk to a human?\"", x: 40, y: 160 },
      { id: "n3", type: "condition", label: "Branch on reply", detail: "1 → Catalog · 2 → AI agent · 3 → Handoff", x: 40, y: 280 },
      { id: "n4", type: "ai", label: "AI agent (support)", detail: "RAG over product KB, confidence < 0.6 → handoff", x: 260, y: 280 },
      { id: "n5", type: "handoff", label: "Assign to Sales team", detail: "Round-robin, SLA 15 min", x: 480, y: 280 },
    ],
    edges: [
      { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "2" }, { from: "n3", to: "n5", label: "3" },
    ],
  },
  {
    id: "bot2", name: "Order Status Lookup", enabled: true, channels: ["ch1", "ch2"],
    triggerSummary: "Keyword: order, track, status", sessionsToday: 61, handoffRate: 0.06,
    updatedAt: ago(60 * 24 * 8),
    nodes: [
      { id: "n1", type: "trigger", label: "Keyword match", detail: "\"order\" / \"track\" / \"status\"", x: 40, y: 40 },
      { id: "n2", type: "message", label: "Ask for order ID", detail: "\"Sure! What's your order number?\"", x: 40, y: 160 },
      { id: "n3", type: "ai", label: "Lookup order (tool)", detail: "HTTP node → orders API → format reply", x: 40, y: 280 },
    ],
    edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
  },
  {
    id: "bot3", name: "CTWA Ad Responder", enabled: false, channels: ["ch1"],
    triggerSummary: "CTWA referral present", sessionsToday: 0, handoffRate: 0,
    updatedAt: ago(60 * 24 * 20),
    nodes: [
      { id: "n1", type: "trigger", label: "Ad click-to-WhatsApp", detail: "referral.source_id present", x: 40, y: 40 },
      { id: "n2", type: "message", label: "Thank + offer", detail: "References the specific ad creative", x: 40, y: 160 },
    ],
    edges: [{ from: "n1", to: "n2" }],
  },
];

function seriesDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now - (n - 1 - i) * 86_400_000);
    const base = 800 + Math.round(Math.sin(i / 2) * 150);
    return { date: d.toISOString().slice(0, 10), sent: base + i * 12, received: Math.round((base + i * 12) * 0.62) };
  });
}

export const analyticsSummary: AnalyticsSummary = {
  messagesSent: 18420,
  messagesReceived: 11260,
  activeConversations: 47,
  avgResponseTimeMin: 6.4,
  deliveryRate: 0.972,
  readRate: 0.681,
  costPaise: 642_300,
  dailySeries: seriesDays(14),
  channelSplit: [
    { channel: "Official (Meta)", count: 13120 },
    { channel: "Quick Connect", count: 5300 },
  ],
  topCampaigns: [
    { name: "Diwali Sale Blast", delivered: 4690, read: 3102, ctr: 0.14 },
    { name: "Cart Recovery — Sep", delivered: 165, read: 90, ctr: 0.22 },
    { name: "VIP Early Access", delivered: 58, read: 51, ctr: 0.31 },
  ],
};
