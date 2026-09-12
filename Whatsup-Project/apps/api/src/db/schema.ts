import {
  pgTable, pgEnum, uuid, text, timestamp, boolean, integer, jsonb, unique,
} from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("provider", ["meta", "whapi", "waha", "messenger", "instagram"]);
export const convStatusEnum = pgEnum("conv_status", ["open", "pending", "snoozed", "resolved"]);
export const directionEnum = pgEnum("direction", ["in", "out"]);
export const msgStatusEnum = pgEnum("msg_status", ["sent", "delivered", "read", "failed"]);
export const roleEnum = pgEnum("role", [
  "platform_admin", "partner_owner", "partner_admin", "partner_support",
  "org_owner", "org_admin", "supervisor", "agent", "viewer",
]);

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  brand: jsonb("brand").$type<Record<string, unknown>>().default({}),
  customDomain: text("custom_domain"),
  billingMode: text("billing_mode").default("direct"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Partner-level team: users who manage a partner's client orgs (multi-vendor/reseller
// management + white-label). Distinct from org_members — a partner_owner/admin does not
// automatically get access to a client org's data; that's governed separately (see the
// architecture doc's partner_access flag), only to the roster of orgs under the partner.
export const partnerMembers = pgTable("partner_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("partner_admin"), // partner_owner | partner_admin | partner_support
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.partnerId, t.userId)]);

export const partnerInvites = pgTable("partner_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("partner_admin"), // partner_owner | partner_admin | partner_support
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").references(() => partners.id),
  // How much this org's data the owning partner can see: none | metadata | full. Explicit
  // per-org grant per the architecture doc — a partner does NOT get org data access by default.
  partnerAccess: text("partner_access").default("none"),
  name: text("name").notNull(),
  planId: text("plan_id").default("free"),
  walletPaise: integer("wallet_paise").default(0),
  timezone: text("timezone").default("Asia/Kolkata"),
  locale: text("locale").default("en"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  mfaEnabled: boolean("mfa_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("agent"),
  status: text("status").default("active"), // "invited" | "active"
}, (t) => [unique().on(t.orgId, t.userId)]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("agent"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull(),
  displayName: text("display_name").notNull(),
  phoneE164: text("phone_e164"),
  externalId: text("external_id"),
  status: text("status").default("disconnected"),
  qualityRating: text("quality_rating"),
  safetyScore: integer("safety_score"),
  warmupDay: integer("warmup_day"),
  // Provider credentials needed to actually send. Dev-only: plaintext jsonb.
  // Production per the architecture doc: move this into Vault/KMS and store only a reference here.
  credentials: jsonb("credentials").$type<Record<string, string>>().default({}),
  webhookVerifyToken: text("webhook_verify_token"),
  connectedAt: timestamp("connected_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  waId: text("wa_id"),
  phoneE164: text("phone_e164").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().default({}),
  tags: text("tags").array().default([]),
  stage: text("stage").default("lead"),
  optIn: boolean("opt_in").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastContactedAt: timestamp("last_contacted_at").defaultNow(),
}, (t) => [unique().on(t.orgId, t.phoneE164)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  status: convStatusEnum("status").default("open"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  unread: integer("unread").default(0),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  serviceWindowExpiresAt: timestamp("service_window_expires_at"),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id),
  direction: directionEnum("direction").notNull(),
  body: text("body").notNull(),
  status: msgStatusEnum("status").default("sent"),
  templateId: uuid("template_id"),
  campaignId: uuid("campaign_id"),
  providerMsgId: text("provider_msg_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  language: text("language").default("en"),
  category: text("category").notNull(),
  status: text("status").default("pending"),
  body: text("body").notNull(),
  variables: text("variables").array().default([]),
  rejectionReason: text("rejection_reason"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.orgId, t.name, t.language)]);

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  channelIds: uuid("channel_ids").array().default([]),
  triggerSummary: text("trigger_summary").notNull(),
  nodes: jsonb("nodes").$type<Array<{ id: string; type: string; label: string; detail: string; x: number; y: number }>>().default([]),
  edges: jsonb("edges").$type<Array<{ from: string; to: string; label?: string }>>().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  templateId: uuid("template_id").notNull().references(() => templates.id),
  segment: text("segment").notNull(),
  audienceCount: integer("audience_count").default(0),
  status: text("status").default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  stats: jsonb("stats").$type<{ sent: number; delivered: number; read: number; failed: number }>()
    .default({ sent: 0, delivered: 0, read: 0, failed: 0 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
