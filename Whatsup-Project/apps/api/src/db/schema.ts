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
// Deal terminal state, separate from which pipeline stage/column it currently sits in
// (see deals.stageId below) — a deal can be marked "won" without having visited every
// stage. Matches the stage-vs-status split competitors (e.g. wacrm) use.
export const dealStatusEnum = pgEnum("deal_status", ["open", "won", "lost"]);

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  brand: jsonb("brand").$type<Record<string, unknown>>().default({}),
  customDomain: text("custom_domain"),
  // Domain verification state machine: unset -> pending (instructions issued, not yet checked
  // ok) -> verified (both TXT ownership proof and CNAME target resolve correctly via live DNS
  // lookups — see partners.ts verify-domain route) or failed (checked, one or both missing).
  customDomainStatus: text("custom_domain_status").default("unset"),
  domainVerificationToken: text("domain_verification_token"),
  domainVerifiedAt: timestamp("domain_verified_at"),
  // Verified (DNS resolves) and active (admin has switched it live) are separate on purpose —
  // an admin can verify a domain ahead of time, or pause a live one, without losing the DNS
  // check state. Public branding lookups require both.
  customDomainActive: boolean("custom_domain_active").default(false),
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
  // Wati-style multi-select functional roles — additive to the hierarchical `role` ladder
  // above, not a replacement: a viewer can also hold "billing_manager" without being promoted
  // to org_admin. See apps/api/src/rbac.ts FUNCTIONAL_ROLE_CAPS for what each grants.
  functionalRoles: text("functional_roles").array().default([]),
}, (t) => [unique().on(t.orgId, t.userId)]);

// Wati-style agent grouping, separate from an individual's role — lets a conversation or
// a routing rule be handed to "Billing Team" instead of naming one agent.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.orgId, t.name)]);

export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [unique().on(t.teamId, t.userId)]);

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
  assignedTeamId: uuid("assigned_team_id").references(() => teams.id),
  unread: integer("unread").default(0),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  // Direction of the most recent message — drives the "pending your reply" SLA flag below
  // without a per-message lookup on every inbox render.
  lastMessageDirection: directionEnum("last_message_direction"),
  serviceWindowExpiresAt: timestamp("service_window_expires_at"),
  // Gallabox-style "pin high-intent conversations" — kept at the top of the inbox
  // independent of status/assignment filters.
  pinned: boolean("pinned").default(false),
});

// Org-shared canned-response library (Wati/Gallabox pattern): static, agent-authored quick
// replies inserted via a "/" shortcut in the composer — distinct from AI-drafted suggestions,
// no LLM cost, and shared across the whole team.
export const cannedResponses = pgTable("canned_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  shortcut: text("shortcut").notNull(),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.orgId, t.shortcut)]);

// Refresh-token rotation: each login/refresh issues one row. `family` links every token
// descended from the same login so reuse of an already-rotated (revoked) token can revoke
// the whole chain — the standard rotation-detection pattern for stolen refresh tokens.
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  family: uuid("family").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Saved "Team Views" in the Inbox — a shared, named combination of filters (status,
// assignment scope, tag) the whole org's team can reuse, per Gallabox's "Team Views"
// pattern. Shared rather than per-user: anyone on the team can see and apply a view;
// only its creator or an org_admin+ can delete it (enforced in the route, not here).
export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<{ status?: string; assignFilter?: string; tag?: string }>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationNotes = pgTable("conversation_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  channel: text("channel").notNull().default("whatsapp"), // whatsapp | sms — SMS templates skip Meta approval, are just plain text
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
  channelId: uuid("channel_id").references(() => channels.id),
  dailyLimit: integer("daily_limit").default(250),
  // "single" = the original one-message blast; "drip" = a real multi-step sequence,
  // each step its own template + delay, driven by campaignSteps below.
  kind: text("kind").default("single"),
  // Wati-style: if a real SMS gateway is configured (see adapters/sms.ts) and a step's
  // WhatsApp send fails, retry that recipient over SMS instead of just marking it failed.
  smsFallback: boolean("sms_fallback").default(false),
  stats: jsonb("stats").$type<{ sent: number; delivered: number; read: number; failed: number }>()
    .default({ sent: 0, delivered: 0, read: 0, failed: 0 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const campaignSteps = pgTable("campaign_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  templateId: uuid("template_id").notNull().references(() => templates.id),
  // Hours after the PREVIOUS step (0 for step 0 — sends immediately when the recipient is due).
  delayHours: integer("delay_hours").default(0),
}, (t) => [unique().on(t.campaignId, t.stepIndex)]);

// One row per audience member per campaign — this is what makes a drip sequence and the
// "pause automation when the contact replies" behavior possible without re-scanning
// `messages` on every tick. currentStep/nextSendAt track where this recipient is in the
// sequence; status "paused" is set the moment they reply mid-sequence (see webhooks.ts).
export const campaignRecipients = pgTable("campaign_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  currentStep: integer("current_step").default(0),
  nextSendAt: timestamp("next_send_at").defaultNow(),
  status: text("status").default("active"), // active | paused | completed
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.campaignId, t.contactId)]);

// Wati-style Automations "Rules": trigger + filter + action, evaluated live against real
// inbound events (see webhooks.ts runAutomations()) — distinct from the drag-and-drop bot
// flow editor, which is a conversational flow, not an event-rule engine.
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(true),
  // "new_conversation" | "keyword_received"
  triggerType: text("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config").$type<{ keyword?: string }>().default({}),
  filters: jsonb("filters").$type<Array<{ field: "channel" | "tag"; op: "eq" | "contains"; value: string }>>().default([]),
  actions: jsonb("actions").$type<Array<
    | { type: "assign_team"; teamId: string }
    | { type: "add_tag"; tag: string }
    | { type: "send_template"; templateId: string }
    | { type: "change_status"; status: string }
    | { type: "create_deal"; pipelineId: string; stageId: string; title?: string; valuePaise?: number }
  >>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Wati's "Ads" module — Click-to-WhatsApp campaigns on Meta Ads. Real Graph Marketing API
// calls when META_AD_ACCOUNT_ID/META_MARKETING_ACCESS_TOKEN are configured (see
// adapters/meta-ads.ts); this table is the local record of what was attempted and its
// real outcome — never a fabricated "active" status.
export const adCampaigns = pgTable("ad_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").references(() => channels.id),
  templateId: uuid("template_id").references(() => templates.id),
  platform: text("platform").notNull().default("whatsapp"), // whatsapp|facebook|instagram|twitter|linkedin|google_ads|tiktok
  name: text("name").notNull(),
  dailyBudgetPaise: integer("daily_budget_paise").notNull(),
  scheduledAt: timestamp("scheduled_at"), // null = launch immediately on create
  status: text("status").default("draft"), // draft | scheduled | active | failed
  externalCampaignId: text("external_campaign_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Organic social posts — Facebook/Instagram/Twitter(X)/LinkedIn/TikTok. Real publish API
// calls per platform (see adapters/social/*); "results" holds each targeted platform's
// real outcome (externalId or error), never a fabricated success.
export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  platforms: text("platforms").array().notNull().default([]), // subset of facebook|instagram|twitter|linkedin|tiktok
  caption: text("caption").notNull(),
  mediaUrl: text("media_url"),
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").default("draft"), // draft | scheduled | published | failed
  results: jsonb("results").$type<Record<string, { status: "published" | "failed"; externalId?: string; error?: string }>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// Sales Pipelines — closes the one real gap found against wacrm (open-source WhatsApp
// CRM competitor, see wacrm.tech/docs/pipelines): a Kanban deal board layered on top of
// contacts/conversations. An org can run multiple pipelines (e.g. "New business" vs
// "Renewals"); each has its own ordered set of stages.
export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#71717a"),
  position: integer("position").notNull().default(0),
});

// A deal/card on the board. Stage = where it sits on the board (moves on drag-and-drop);
// status = its terminal state (open/won/lost) — a deal can be won without having visited
// every stage. valuePaise follows the same money-in-paise convention as orgs.walletPaise.
export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  valuePaise: integer("value_paise").default(0),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  assigneeId: uuid("assignee_id").references(() => users.id),
  expectedCloseDate: timestamp("expected_close_date"),
  notes: text("notes"),
  status: dealStatusEnum("status").default("open"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
