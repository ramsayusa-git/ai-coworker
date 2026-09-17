import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client.js";
import * as s from "./schema-all.js";

// Full-fat demo data: one org with enough real history that every screen in the app
// shows something. Idempotent — everything hangs off a single org with a fixed slug,
// and running it again wipes that org's rows and rebuilds them, so it can be re-run
// after schema changes without piling up duplicates.
//
//   npm run db:demo          seed / re-seed
//   npm run db:demo -- --drop   remove the demo org entirely
const DEMO_ORG = "Aetos Demo Store";
const DEMO_EMAIL = "demo@loqio.local";
const DEMO_PASSWORD = "Demo@Loqio2026";
const DAY = 24 * 3600 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600_000);

async function findDemoOrg() {
  const [org] = await db.select().from(s.orgs).where(eq(s.orgs.name, DEMO_ORG)).limit(1);
  return org ?? null;
}

async function dropDemo() {
  const org = await findDemoOrg();
  if (!org) { console.log("No demo org to drop."); return; }
  // Most tables cascade from orgs; the ones that don't are cleared explicitly first.
  await db.delete(s.licenses).where(eq(s.licenses.orgId, org.id));
  await db.delete(s.dashboardLayouts).where(eq(s.dashboardLayouts.orgId, org.id));
  await db.delete(s.orgs).where(eq(s.orgs.id, org.id));
  await db.delete(s.users).where(eq(s.users.email, DEMO_EMAIL));
  console.log(`Dropped demo org ${org.id} and its user.`);
}

async function main() {
  if (process.argv.includes("--drop")) { await dropDemo(); process.exit(0); }
  await dropDemo(); // re-seed from clean, so the script is safely repeatable

  // ---- org + owner -------------------------------------------------------
  const [org] = await db.insert(s.orgs).values({
    name: DEMO_ORG, planId: "advanced", planCycle: "monthly", planStatus: "active",
    planRenewsAt: new Date(Date.now() + 21 * DAY), billingCountryCode: "IN",
    walletPaise: 1_250_00, deployment: "hosted", timezone: "Asia/Kolkata",
  }).returning();

  const [owner] = await db.insert(s.users).values({
    email: DEMO_EMAIL, name: "Demo Owner", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
  }).returning();
  await db.insert(s.orgMembers).values({
    orgId: org.id, userId: owner.id, role: "org_owner", status: "active",
    functionalRoles: ["administrator"],
  });

  // Two agents, so the inbox has real assignees and the leaderboard is not empty.
  const agents = [];
  for (const [name, email] of [["Priya Nair", "priya@loqio.local"], ["Arjun Rao", "arjun@loqio.local"]] as const) {
    const [u] = await db.insert(s.users).values({
      email, name, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    }).onConflictDoUpdate({ target: s.users.email, set: { name } }).returning();
    await db.insert(s.orgMembers).values({ orgId: org.id, userId: u.id, role: "agent", status: "active" })
      .onConflictDoNothing();
    agents.push(u);
  }

  const [team] = await db.insert(s.teams).values({ orgId: org.id, name: "Front Desk" }).returning();
  for (const a of agents) {
    await db.insert(s.teamMembers).values({ orgId: org.id, teamId: team.id, userId: a.id }).onConflictDoNothing();
  }

  // ---- channel -----------------------------------------------------------
  const [channel] = await db.insert(s.channels).values({
    orgId: org.id, provider: "meta", displayName: "Aetos Demo (Official)",
    phoneE164: "+919000000001", status: "connected", qualityRating: "green",
    safetyScore: 92, warmupDay: 21, credentials: {}, connectedAt: ago(60),
  }).returning();

  // ---- companies + contacts ---------------------------------------------
  const companyRows = await db.insert(s.companies).values([
    { orgId: org.id, name: "Sunrise Motors", domain: "sunrisemotors.example", industry: "Automotive" },
    { orgId: org.id, name: "Kadam Clinics", domain: "kadamclinics.example", industry: "Healthcare" },
    { orgId: org.id, name: "Nova Interiors", domain: "novainteriors.example", industry: "Retail" },
  ]).returning();

  const contactSpecs = [
    ["Priya Sharma", "+919812345601", "priya.sharma@example.com", ["vip", "delhi"], 0, "lead"],
    ["Arjun Mehta", "+919812345602", "arjun.mehta@example.com", ["customer"], 0, "customer"],
    ["Sneha Iyer", "+919812345603", "sneha.iyer@example.com", ["vip", "repeat"], 1, "customer"],
    ["Rahul Verma", "+919812345604", "rahul.verma@example.com", ["lead"], 2, "lead"],
    ["Divya Menon", "+919812345605", "divya.menon@example.com", ["newsletter"], 1, "lead"],
    ["Karthik Nair", "+919812345606", "karthik.nair@example.com", ["customer", "repeat"], 2, "customer"],
    ["Meera Joshi", "+919812345607", "meera.joshi@example.com", ["lead", "mumbai"], null, "lead"],
    ["Vikram Desai", "+919812345608", "vikram.desai@example.com", ["churn-risk"], 0, "customer"],
  ] as const;

  const contacts = [];
  for (const [name, phone, email, tags, companyIdx, stage] of contactSpecs) {
    const [c] = await db.insert(s.contacts).values({
      orgId: org.id, name, phoneE164: phone, email, tags: [...tags],
      companyId: companyIdx === null ? null : companyRows[companyIdx].id,
      optIn: true, stage, source: "whatsapp",
    }).returning();
    contacts.push(c);
  }

  // ---- templates (including interactive ones) ----------------------------
  const templateRows = await db.insert(s.templates).values([
    {
      orgId: org.id, name: "order_shipped", category: "UTILITY", status: "approved",
      body: "Hi {{1}}, your order #{{2}} has shipped and arrives by {{3}}.",
      variables: ["1", "2", "3"], headerType: "text", headerText: "Aetos Demo Store",
      footer: "Reply anytime", interactiveType: "buttons",
      buttons: [
        { kind: "quick_reply", text: "Track order", payload: "track" },
        { kind: "url", text: "View invoice", url: "https://example.com/invoice" },
      ],
    },
    {
      orgId: org.id, name: "showroom_menu", category: "MARKETING", status: "approved",
      body: "Hi {{1}}, what can we help you with today?", variables: ["1"],
      interactiveType: "list", listButtonText: "Main menu",
      listSections: [{
        title: "Popular", rows: [
          { id: "test_drive", title: "Book a test drive" },
          { id: "emi", title: "Calculate EMI" },
          { id: "offers", title: "Latest offers", description: "This month's deals" },
        ],
      }],
    },
    {
      orgId: org.id, name: "festive_offer", category: "MARKETING", status: "approved",
      body: "Hi {{1}}, 25% off servicing this festive season.", variables: ["1"],
      interactiveType: "buttons", buttons: [{ kind: "quick_reply", text: "Claim now", payload: "claim" }],
    },
    {
      orgId: org.id, name: "feedback_request", category: "UTILITY", status: "approved",
      body: "Hi {{1}}, how did we do? Rate us 1-10.", variables: ["1"], interactiveType: "none",
    },
    {
      orgId: org.id, name: "payment_reminder", category: "UTILITY", status: "pending",
      body: "Hi {{1}}, invoice {{2}} is due on {{3}}.", variables: ["1", "2", "3"], interactiveType: "none",
    },
    {
      orgId: org.id, name: "sms_otp", channel: "sms", category: "AUTHENTICATION", status: "approved",
      body: "Your Aetos Demo code is {{1}}. Valid 10 minutes.", variables: ["1"],
    },
  ]).returning();
  const tplByName = Object.fromEntries(templateRows.map((t) => [t.name, t]));

  // ---- conversations + message history -----------------------------------
  // Spread over 14 days so the dashboard's trend chart and analytics have a shape.
  const threads: Array<{ contact: number; status: string; assignee: number | null; days: number; msgs: Array<[string, string, string?]> }> = [
    { contact: 0, status: "open", assignee: 0, days: 0, msgs: [
      ["in", "Hi, is the Fronx available in blue?"],
      ["out", "Hi Priya! Yes, blue is in stock at our Delhi showroom."],
      ["in", "Great — can I book a test drive?"],
    ]},
    { contact: 1, status: "resolved", assignee: 0, days: 3, msgs: [
      ["in", "Order status please"],
      ["out", "Hi Arjun, your order #4821 has shipped and arrives by Friday.", "interactive"],
      ["in", "Track order", "button_reply"],
      ["out", "Here's your tracking link: https://example.com/track/4821"],
      ["in", "Thanks, got it."],
    ]},
    { contact: 2, status: "pending", assignee: 1, days: 1, msgs: [
      ["in", "Do you service Audi R8?"],
      ["out", "We do — our Bandra centre handles premium servicing."],
      ["in", "What's the cost for a full service?"],
    ]},
    { contact: 3, status: "open", assignee: null, days: 0, msgs: [
      ["in", "Saw your ad. Send me the offers."],
    ]},
    { contact: 5, status: "resolved", assignee: 1, days: 6, msgs: [
      ["in", "Need an invoice copy"],
      ["out", "Sent to your email. Anything else?"],
      ["in", "All good, thanks!"],
    ]},
    { contact: 7, status: "snoozed", assignee: 0, days: 9, msgs: [
      ["in", "I'm still waiting on a callback."],
      ["out", "Apologies Vikram — booking you in for tomorrow morning."],
    ]},
  ];

  const convRows = [];
  for (const t of threads) {
    const contact = contacts[t.contact];
    const last = t.msgs[t.msgs.length - 1];
    const [conv] = await db.insert(s.conversations).values({
      orgId: org.id, channelId: channel.id, contactId: contact.id,
      status: t.status as any, assigneeId: t.assignee === null ? null : agents[t.assignee].id,
      assignedTeamId: t.assignee === null ? team.id : null,
      unread: last[0] === "in" ? 1 : 0,
      lastMessage: last[1], lastMessageAt: ago(t.days, 1), lastMessageDirection: last[0] as any,
      serviceWindowExpiresAt: new Date(Date.now() + 20 * 3600_000),
      pinned: t.contact === 0,
    }).returning();
    convRows.push(conv);

    let offsetH = t.msgs.length;
    for (const [dir, body, kind] of t.msgs) {
      await db.insert(s.messages).values({
        orgId: org.id, conversationId: conv.id, channelId: channel.id,
        direction: dir as any, body,
        status: dir === "out" ? "read" : "read",
        msgType: kind ?? "text",
        interactive: kind === "interactive"
          ? { type: "buttons", body, buttons: tplByName.order_shipped.buttons }
          : kind === "button_reply" ? { buttonId: "track", buttonText: "Track order" } : null,
        templateId: kind === "interactive" ? tplByName.order_shipped.id : null,
        createdAt: ago(t.days, offsetH--),
      });
    }
  }

  // Older one-way traffic so the 14-day chart isn't a single spike.
  for (let d = 13; d >= 1; d--) {
    const count = 1 + ((d * 7) % 4);
    for (let i = 0; i < count; i++) {
      await db.insert(s.messages).values({
        orgId: org.id, conversationId: convRows[i % convRows.length].id, channelId: channel.id,
        direction: i % 3 === 0 ? "in" : "out",
        body: i % 3 === 0 ? "(historical enquiry)" : "(historical reply)",
        status: i % 4 === 0 ? "delivered" : "read",
        createdAt: ago(d, i),
      });
    }
  }

  // ---- notes, canned responses, saved view --------------------------------
  await db.insert(s.conversationNotes).values({
    orgId: org.id, conversationId: convRows[0].id, authorId: agents[0].id,
    body: "Wants blue Fronx — check Delhi stock before promising a date.",
  });
  await db.insert(s.cannedResponses).values([
    { orgId: org.id, shortcut: "hours", body: "We're open 9am-7pm, Monday to Saturday." },
    { orgId: org.id, shortcut: "thanks", body: "Thanks for reaching out! Anything else I can help with?" },
    { orgId: org.id, shortcut: "callback", body: "I've booked a callback for you — our team will ring within 2 hours." },
  ]);
  await db.insert(s.savedViews).values({
    orgId: org.id, name: "Needs reply today", createdBy: owner.id,
    filters: { status: "open", assignFilter: "team" },
  });

  // ---- pipeline + deals ---------------------------------------------------
  const [pipeline] = await db.insert(s.pipelines).values({
    orgId: org.id, name: "New business", isDefault: true,
  }).returning();
  const stageNames = [["New", "#64748b"], ["Qualified", "#0ea5e9"], ["Demo booked", "#8b5cf6"], ["Negotiation", "#f59e0b"], ["Closing", "#10b981"]] as const;
  const stages = [];
  for (let i = 0; i < stageNames.length; i++) {
    const [st] = await db.insert(s.pipelineStages).values({
      orgId: org.id, pipelineId: pipeline.id, name: stageNames[i][0], color: stageNames[i][1], position: i,
    }).returning();
    stages.push(st);
  }

  const dealSpecs = [
    ["Fronx Sigma — Priya Sharma", 0, 2, 985000_00, "open", 0],
    ["Service AMC — Arjun Mehta", 1, 4, 42000_00, "open", 0],
    ["Fleet of 4 — Nova Interiors", 2, 3, 3800000_00, "open", 1],
    ["R8 servicing — Sneha Iyer", 2, 1, 120000_00, "open", 1],
    ["Exchange deal — Karthik Nair", 5, 4, 640000_00, "won", 0],
    ["Enquiry — Rahul Verma", 3, 0, 0, "open", null],
    ["Lost to dealer — Vikram Desai", 7, 1, 550000_00, "lost", 0],
  ] as const;
  for (let i = 0; i < dealSpecs.length; i++) {
    const [title, contactIdx, stageIdx, value, status, assigneeIdx] = dealSpecs[i];
    await db.insert(s.deals).values({
      orgId: org.id, pipelineId: pipeline.id, stageId: stages[stageIdx].id, title,
      valuePaise: value, contactId: contacts[contactIdx].id, status: status as any,
      assigneeId: assigneeIdx === null ? null : agents[assigneeIdx].id,
      expectedCloseDate: new Date(Date.now() + (i + 3) * DAY), position: i,
      createdAt: ago(20 - i * 2),
    });
  }

  // ---- tasks --------------------------------------------------------------
  await db.insert(s.tasks).values([
    { orgId: org.id, title: "Call Priya about blue Fronx stock", type: "call", dueAt: new Date(Date.now() + 2 * 3600_000), contactId: contacts[0].id, assigneeId: agents[0].id, status: "open" },
    { orgId: org.id, title: "Send AMC quote to Arjun", type: "whatsapp", dueAt: ago(1), contactId: contacts[1].id, assigneeId: agents[0].id, status: "open" },
    { orgId: org.id, title: "Fleet proposal for Nova Interiors", type: "follow_up", dueAt: new Date(Date.now() + 3 * DAY), contactId: contacts[4].id, assigneeId: agents[1].id, status: "open" },
    { orgId: org.id, title: "Callback — Vikram Desai", type: "call", dueAt: ago(3), contactId: contacts[7].id, assigneeId: agents[0].id, status: "open" },
    { orgId: org.id, title: "Log festive campaign results", type: "other", dueAt: ago(5), assigneeId: owner.id, status: "done" },
  ]);

  // ---- flow + responses ---------------------------------------------------
  const [flow] = await db.insert(s.flows).values({
    orgId: org.id, name: "Book a Service", status: "draft", categories: ["APPOINTMENT_BOOKING"],
    channelId: channel.id,
    screens: [{
      id: "BOOK", title: "Book a Service", terminal: true, ctaLabel: "SEND",
      fields: [
        { name: "date", label: "Preferred date", type: "date", required: true },
        { name: "time", label: "Preferred time", type: "text", required: true },
        { name: "model", label: "Model", type: "dropdown", required: true, options: ["Fronx Sigma", "Baleno", "Ertiga"] },
      ],
    }],
  }).returning();
  await db.insert(s.flowResponses).values([
    { orgId: org.id, flowId: flow.id, contactId: contacts[2].id, conversationId: convRows[2].id,
      answers: { date: "2026-09-22", time: "11:00", model: "Fronx Sigma" }, createdAt: ago(2) },
    { orgId: org.id, flowId: flow.id, contactId: contacts[5].id, conversationId: convRows[4].id,
      answers: { date: "2026-09-25", time: "16:30", model: "Ertiga" }, createdAt: ago(5) },
  ]);

  // ---- campaigns (one completed with a real funnel, one drip, one scheduled)
  const [festive] = await db.insert(s.campaigns).values({
    orgId: org.id, name: "Festive service offer", status: "completed", channelId: channel.id,
    templateId: tplByName.festive_offer.id, segment: "All opted-in contacts",
    audienceCount: 8, dailyLimit: 250, kind: "single", createdAt: ago(7),
  }).returning();
  // Funnel numbers come from real message rows, the same way the live app computes them.
  for (let i = 0; i < 8; i++) {
    await db.insert(s.messages).values({
      orgId: org.id, conversationId: convRows[i % convRows.length].id, channelId: channel.id,
      direction: "out", body: "Hi there, 25% off servicing this festive season.",
      status: i < 2 ? "read" : i < 6 ? "delivered" : "failed",
      msgType: "interactive",
      interactive: { type: "buttons", body: "Festive offer", buttons: tplByName.festive_offer.buttons },
      templateId: tplByName.festive_offer.id, campaignId: festive.id,
      errorMessage: i >= 6 ? "Recipient has not opted in" : null,
      createdAt: ago(7, i),
    });
  }

  const [drip] = await db.insert(s.campaigns).values({
    orgId: org.id, name: "New-lead nurture (3 steps)", status: "sending", channelId: channel.id,
    templateId: tplByName.showroom_menu.id, segment: "lead", audienceCount: 3,
    dailyLimit: 100, kind: "drip", smsFallback: true, createdAt: ago(2),
  }).returning();
  await db.insert(s.campaignSteps).values([
    { orgId: org.id, campaignId: drip.id, stepIndex: 0, templateId: tplByName.showroom_menu.id, delayHours: 0 },
    { orgId: org.id, campaignId: drip.id, stepIndex: 1, templateId: tplByName.festive_offer.id, delayHours: 72 },
    { orgId: org.id, campaignId: drip.id, stepIndex: 2, templateId: tplByName.feedback_request.id, delayHours: 216 },
  ]);
  for (const idx of [3, 4, 6]) {
    await db.insert(s.campaignRecipients).values({
      orgId: org.id, campaignId: drip.id, contactId: contacts[idx].id,
      currentStep: 1, nextSendAt: new Date(Date.now() + 2 * DAY), status: "active",
    });
  }

  await db.insert(s.campaigns).values({
    orgId: org.id, name: "Diwali VIP preview", status: "scheduled", channelId: channel.id,
    templateId: tplByName.festive_offer.id, segment: "vip", audienceCount: 2,
    dailyLimit: 250, kind: "single", scheduledAt: new Date(Date.now() + 4 * DAY),
  });

  // ---- automations --------------------------------------------------------
  await db.insert(s.automationRules).values([
    { orgId: org.id, name: "Route new chats to Front Desk", enabled: true,
      triggerType: "new_conversation", triggerConfig: {}, filters: [],
      actions: [{ type: "assign_team", teamId: team.id }] },
    { orgId: org.id, name: "Tag pricing enquiries", enabled: true,
      triggerType: "keyword_received", triggerConfig: { keyword: "price" }, filters: [],
      actions: [{ type: "add_tag", tag: "pricing" }] },
  ]);

  // ---- wallet + metered conversations -------------------------------------
  await db.insert(s.walletTransactions).values([
    { orgId: org.id, kind: "credit", amountPaise: 150000, balanceAfterPaise: 150000, reason: "Opening top-up", refType: "topup" },
    { orgId: org.id, kind: "debit", amountPaise: -87, balanceAfterPaise: 149913, reason: "marketing conversation (IN)", refType: "conversation_charge" },
    { orgId: org.id, kind: "debit", amountPaise: -12, balanceAfterPaise: 149901, reason: "utility conversation (IN)", refType: "conversation_charge" },
  ]);
  const windowStart = new Date(Math.floor(Date.now() / DAY) * DAY);
  await db.insert(s.conversationCharges).values([
    { orgId: org.id, conversationId: convRows[0].id, category: "marketing", countryCode: "IN",
      ratePaise: 86500, windowStart, windowEnd: new Date(windowStart.getTime() + DAY) },
    { orgId: org.id, conversationId: convRows[1].id, category: "utility", countryCode: "IN",
      ratePaise: 11500, windowStart, windowEnd: new Date(windowStart.getTime() + DAY) },
  ]).onConflictDoNothing();

  // ---- service desk -------------------------------------------------------
  await db.insert(s.ticketRules).values([
    { orgId: org.id, name: "Billing goes to Front Desk", position: 0,
      conditions: [{ field: "subject", op: "contains", value: "invoice" }],
      action: "round_robin", actionConfig: { teamId: team.id } },
    { orgId: org.id, name: "Delivery issues are high priority", position: 1,
      conditions: [{ field: "category", op: "eq", value: "delivery" }],
      action: "set_priority", actionConfig: { priority: "high" } },
  ]);

  const ticketSpecs = [
    ["Blue Fronx delivery is late", "delivery", "high", "open", 0, 0, 30],
    ["Wrong invoice amount on #4821", "billing", "urgent", "open", 1, 1, 3],
    ["Service centre closed on arrival", "service", "normal", "pending", 2, 0, 26],
    ["Need duplicate registration papers", "documents", "low", "resolved", 5, 1, 72],
    ["App login not working", "technical", "normal", "closed", 7, 0, 96],
  ] as const;

  for (let i = 0; i < ticketSpecs.length; i++) {
    const [subject, category, priority, status, contactIdx, agentIdx, hoursAgo] = ticketSpecs[i];
    const created = ago(0, hoursAgo);
    const slaHours = priority === "urgent" ? 2 : priority === "high" ? 4 : priority === "low" ? 72 : 24;
    // The first two are deliberately left without a first response and past their SLA,
    // so the breach badge has something real to show.
    const answered = i > 1;
    const [t] = await db.insert(s.tickets).values({
      orgId: org.id, number: i + 1, subject,
      body: `Customer reported: ${subject.toLowerCase()}.`,
      category, priority, status: status as any, source: "whatsapp",
      contactId: contacts[contactIdx].id,
      conversationId: convRows[contactIdx % convRows.length].id,
      assigneeId: agents[agentIdx].id,
      slaDueAt: new Date(created.getTime() + slaHours * 3600_000),
      firstResponseAt: answered ? new Date(created.getTime() + 40 * 60_000) : null,
      resolvedAt: status === "resolved" || status === "closed" ? ago(0, hoursAgo - 4) : null,
      closedAt: status === "closed" ? ago(0, hoursAgo - 2) : null,
      createdBy: owner.id, createdAt: created, updatedAt: created,
    }).returning();

    await db.insert(s.ticketEvents).values([
      { orgId: org.id, ticketId: t.id, kind: "created", body: "Created from a WhatsApp conversation.", actorId: owner.id, createdAt: created },
      ...(answered ? [{ orgId: org.id, ticketId: t.id, kind: "reply", body: "Thanks for flagging — looking into this now.", actorId: agents[agentIdx].id, createdAt: new Date(created.getTime() + 40 * 60_000) }] : []),
      ...(status === "resolved" || status === "closed" ? [{ orgId: org.id, ticketId: t.id, kind: "status", body: `Status open → ${status}`, actorId: agents[agentIdx].id, createdAt: ago(0, hoursAgo - 4) }] : []),
    ] as any);
  }

  // ---- lead scoring + distribution ----------------------------------------
  await db.insert(s.leadScoringRules).values([
    { orgId: org.id, name: "VIP tag", criterion: "has_tag", value: "vip", points: 30 },
    { orgId: org.id, name: "Has an open deal", criterion: "has_open_deal", points: 25 },
    { orgId: org.id, name: "Replied in the last 7 days", criterion: "replied_within_days", value: "7", points: 20 },
    { orgId: org.id, name: "Repeat customer", criterion: "has_tag", value: "repeat", points: 15 },
  ]);
  await db.insert(s.distributionRules).values({
    orgId: org.id, name: "Round-robin across Front Desk", strategy: "round_robin",
    targetTeamId: team.id, conditions: [], position: 0,
  });

  // ---- quotes -------------------------------------------------------------
  const quoteSpecs = [
    ["Fronx Sigma + accessories", 0, "sent", 18, 5000_00, [["Fronx Sigma", 1, 985000_00], ["Extended warranty", 2, 15000_00]]],
    ["Annual service package", 1, "accepted", 18, 0, [["AMC gold, 12 months", 1, 42000_00]]],
    ["Fleet of 4 — Nova Interiors", 4, "draft", 18, 50000_00, [["Ertiga ZXi", 4, 950000_00], ["Fleet branding", 4, 12000_00]]],
  ] as const;

  for (let i = 0; i < quoteSpecs.length; i++) {
    const [title, contactIdx, status, taxPercent, discountPaise, lines] = quoteSpecs[i];
    const subtotal = lines.reduce((acc, [, qty, price]) => acc + (qty as number) * (price as number), 0);
    const taxable = subtotal - discountPaise;
    const taxPaise = Math.round((taxable * taxPercent) / 100);
    const [q] = await db.insert(s.quotes).values({
      orgId: org.id, number: i + 1, title, contactId: contacts[contactIdx].id,
      status: status as any, taxPercent, discountPaise,
      subtotalPaise: subtotal, taxPaise, totalPaise: taxable + taxPaise,
      validUntil: new Date(Date.now() + 14 * DAY),
      sentAt: status === "draft" ? null : ago(3 + i),
      acceptedAt: status === "accepted" ? ago(1) : null,
      createdBy: owner.id, createdAt: ago(5 + i),
    }).returning();
    await db.insert(s.quoteItems).values(lines.map(([description, quantity, unitPricePaise], j) => ({
      orgId: org.id, quoteId: q.id, description: description as string,
      quantity: quantity as number, unitPricePaise: unitPricePaise as number, position: j,
    })));
  }

  // ---- appointments -------------------------------------------------------
  await db.insert(s.appointments).values([
    { orgId: org.id, title: "Test drive — Fronx Sigma", contactId: contacts[0].id, assigneeId: agents[0].id,
      startsAt: new Date(Date.now() + 1 * DAY), durationMinutes: 45, location: "Delhi showroom", status: "confirmed" },
    { orgId: org.id, title: "Service pickup — Audi R8", contactId: contacts[2].id, assigneeId: agents[1].id,
      startsAt: new Date(Date.now() + 2 * DAY + 3 * 3600_000), durationMinutes: 30, location: "Customer address", status: "scheduled" },
    { orgId: org.id, title: "Fleet walkthrough", contactId: contacts[4].id, assigneeId: agents[1].id,
      startsAt: new Date(Date.now() + 4 * DAY), durationMinutes: 90, location: "Nova Interiors office", status: "scheduled" },
    { orgId: org.id, title: "Handover — Ertiga", contactId: contacts[5].id, assigneeId: agents[0].id,
      startsAt: ago(2), durationMinutes: 60, location: "Delhi showroom", status: "completed" },
  ]);

  // ---- surveys ------------------------------------------------------------
  const [csat] = await db.insert(s.surveys).values({
    orgId: org.id, name: "Post-service CSAT", kind: "csat",
    question: "How did we do today?", trigger: "conversation_resolved",
    channelId: channel.id, delayMinutes: 15,
  }).returning();
  const [nps] = await db.insert(s.surveys).values({
    orgId: org.id, name: "Quarterly NPS", kind: "nps",
    question: "How likely are you to recommend Aetos Demo Store?", trigger: "none",
    channelId: channel.id, delayMinutes: 0,
  }).returning();

  const csatScores = [5, 4, 5, 3, null];
  for (let i = 0; i < csatScores.length; i++) {
    const score = csatScores[i];
    await db.insert(s.surveyResponses).values({
      orgId: org.id, surveyId: csat.id, contactId: contacts[i].id,
      conversationId: convRows[i % convRows.length].id,
      score, comment: score === 3 ? "Took a while to get a reply" : score ? "All good" : null,
      status: score === null ? "sent" : "answered",
      sentAt: ago(i + 1), answeredAt: score === null ? null : ago(i + 1, -2),
    }).onConflictDoNothing();
  }
  for (const [i, score] of [9, 10, 6].entries()) {
    await db.insert(s.surveyResponses).values({
      orgId: org.id, surveyId: nps.id, contactId: contacts[i + 2].id,
      conversationId: convRows[(i + 2) % convRows.length].id,
      score, status: "answered", sentAt: ago(6 + i), answeredAt: ago(6 + i, -3),
    }).onConflictDoNothing();
  }

  console.log(JSON.stringify({
    orgId: org.id, login: DEMO_EMAIL, password: DEMO_PASSWORD,
    contacts: contacts.length, conversations: convRows.length, templates: templateRows.length,
    companies: companyRows.length, deals: dealSpecs.length, agents: agents.length,
    campaigns: 3, flows: 1, pipelineStages: stages.length,
    tickets: ticketSpecs.length, quotes: quoteSpecs.length, appointments: 4, surveys: 2,
  }, null, 2));
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
