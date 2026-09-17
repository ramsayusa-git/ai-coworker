import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, unique,
} from "drizzle-orm/pg-core";
import { orgs, users, teams, contacts, conversations, deals, templates, channels } from "./schema.js";

// Modules built from the Office24by7 feature audit (17 Sep 2026): service desk,
// lead scoring and distribution, quotes, appointments and surveys. Kept in their own
// file because schema.ts had grown past the point where anything could be found in it.

// ---------------------------------------------------------------------------
// Service desk
// ---------------------------------------------------------------------------
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  // Human-facing reference (#1, #2 …) unique per org — customers quote these, so they
  // cannot be UUIDs and cannot be global.
  number: integer("number").notNull(),
  subject: text("subject").notNull(),
  body: text("body"),
  // low | normal | high | urgent
  priority: text("priority").notNull().default("normal"),
  category: text("category"),
  // open | pending | on_hold | resolved | closed
  status: text("status").notNull().default("open"),
  source: text("source").notNull().default("whatsapp"), // whatsapp | email | phone | web | api
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  assignedTeamId: uuid("assigned_team_id").references(() => teams.id, { onDelete: "set null" }),
  // Merging keeps the duplicate row so its number still resolves, pointing at the survivor.
  mergedIntoId: uuid("merged_into_id"),
  firstResponseAt: timestamp("first_response_at"),
  slaDueAt: timestamp("sla_due_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  tags: text("tags").array().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.orgId, t.number)]);

// Append-only activity log — every status change, assignment, note and reply.
export const ticketEvents = pgTable("ticket_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  // created | status | assigned | priority | note | reply | merged | sla_breach
  kind: text("kind").notNull(),
  body: text("body"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auto-assignment and routing, evaluated in `position` order on ticket creation.
export const ticketRules = pgTable("ticket_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
  // All conditions must match. field: subject | body | category | priority | source | tag
  conditions: jsonb("conditions").$type<Array<{ field: string; op: "contains" | "eq"; value: string }>>().default([]),
  // assign_team | assign_agent | round_robin | set_priority | set_category | set_sla
  action: text("action").notNull(),
  actionConfig: jsonb("action_config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Lead scoring and distribution
// ---------------------------------------------------------------------------
export const leadScoringRules = pgTable("lead_scoring_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // has_tag | source_is | stage_is | replied_within_days | has_open_deal | deal_value_over
  criterion: text("criterion").notNull(),
  value: text("value"),
  points: integer("points").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const distributionRules = pgTable("distribution_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
  // Only leads matching every condition are distributed by this rule.
  conditions: jsonb("conditions").$type<Array<{ field: string; op: "contains" | "eq"; value: string }>>().default([]),
  // round_robin | least_loaded | fixed
  strategy: text("strategy").notNull().default("round_robin"),
  // Candidate owners: explicit user ids, or every member of a team.
  targetUserIds: uuid("target_user_ids").array().default([]),
  targetTeamId: uuid("target_team_id").references(() => teams.id, { onDelete: "set null" }),
  // Where round-robin got to last time, so assignment survives a restart.
  cursor: integer("cursor").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  // draft | sent | accepted | declined | expired
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("INR"),
  // Totals are stored in paise and recomputed from the line items on every write, so a
  // stale total can never be displayed or sent.
  subtotalPaise: integer("subtotal_paise").notNull().default(0),
  taxPercent: integer("tax_percent").notNull().default(0),
  taxPaise: integer("tax_paise").notNull().default(0),
  discountPaise: integer("discount_paise").notNull().default(0),
  totalPaise: integer("total_paise").notNull().default(0),
  notes: text("notes"),
  validUntil: timestamp("valid_until"),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.orgId, t.number)]);

export const quoteItems = pgTable("quote_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPricePaise: integer("unit_price_paise").notNull().default(0),
  position: integer("position").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  location: text("location"),
  notes: text("notes"),
  // scheduled | confirmed | completed | cancelled | no_show
  status: text("status").notNull().default("scheduled"),
  // Reminder sent over WhatsApp; the timestamp stops it being sent twice.
  reminderTemplateId: uuid("reminder_template_id").references(() => templates.id, { onDelete: "set null" }),
  reminderMinutesBefore: integer("reminder_minutes_before").default(60),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Surveys / CSAT
// ---------------------------------------------------------------------------
export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // csat (1-5) | nps (0-10) | custom
  kind: text("kind").notNull().default("csat"),
  question: text("question").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // none | conversation_resolved | ticket_closed — what fires the send.
  trigger: text("trigger").notNull().default("none"),
  templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  // Wait this long after the trigger before asking, so the survey doesn't land
  // in the middle of the conversation it is asking about.
  delayMinutes: integer("delay_minutes").notNull().default(15),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const surveyResponses = pgTable("survey_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
  score: integer("score"),
  comment: text("comment"),
  // sent | answered | expired
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  answeredAt: timestamp("answered_at"),
}, (t) => [unique().on(t.surveyId, t.conversationId)]);
