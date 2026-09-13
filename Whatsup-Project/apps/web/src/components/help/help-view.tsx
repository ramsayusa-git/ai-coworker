"use client";

type Section = {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  what: string;
  steps: string[];
  note?: string;
};

const sections: Section[] = [
  {
    id: "broadcasts", emoji: "📣", title: "Broadcasts", tag: "campaigns",
    what: "Send a one-off blast or a multi-step drip sequence to a segment of contacts, with an optional schedule and SMS fallback.",
    steps: [
      "Click + New broadcast top-right.",
      "Choose Single message for a one-time send, or Drip sequence to send several templates in order over time.",
      "Name the campaign, pick an approved template, and choose the audience segment (or \"All opted-in contacts\").",
      "Set a Daily send limit — sends are staggered across days to protect your WhatsApp quality rating.",
      "To send later instead of immediately, fill in Schedule — leave it blank to start sending as soon as you save.",
      "Optionally tick Fall back to SMS if a WhatsApp send fails (needs an SMS provider configured on the server).",
      "For a drip sequence, add each step's template and the delay in hours after the previous step; a reply from the contact pauses them automatically.",
      "Click Start sending (or Schedule if a time was set).",
    ],
    note: "The campaign table shows real-time status (draft / scheduled / sending / completed) and a live funnel: Sent · Delivered · Read · Failed · Queued.",
  },
  {
    id: "templates", emoji: "📄", title: "Templates", tag: "whatsapp + sms",
    what: "Reusable message templates for both WhatsApp (needs Meta approval) and SMS (plain text, no approval step).",
    steps: [
      "Use the All Channels / Whatsapp / Sms pills to filter the library, and the status pills (Approved / Pending / Rejected / Draft) below that.",
      "Click + New template to create one — pick the channel first, since SMS templates skip the Meta approval workflow entirely.",
      "Use {{1}}, {{2}}, … as placeholders — they get filled in per-contact when a broadcast or automation sends the message.",
      "WhatsApp templates go to \"Pending\" until Meta approves them; only approved templates can be used in a broadcast.",
    ],
  },
  {
    id: "automations", emoji: "⚡", title: "Automations", tag: "rules",
    what: "Trigger → filter → action rules evaluated live against real inbound messages — e.g. auto-tag a contact or send a reply when a keyword appears.",
    steps: [
      "Click + New rule.",
      "Pick a trigger — a new conversation starting, or a keyword appearing in an inbound message.",
      "Add an optional filter (e.g. only for a given channel or tag).",
      "Choose the action — send a template, add a tag, assign to a team, etc.",
      "Save; the rule then runs automatically against every matching incoming message — no manual step needed.",
    ],
    note: "This is different from Bots: Automations react to a single event, while a Bot runs a full multi-turn conversation flow.",
  },
  {
    id: "ads-social", emoji: "📢", title: "Ads & Social Manager", tag: "7 ad platforms · 5 organic",
    what: "Run real paid ad campaigns and organic posts across WhatsApp, Facebook, Instagram, Twitter/X, LinkedIn, Google Ads and TikTok.",
    steps: [
      "Two tabs: Ad Campaigns (paid) and Organic Posts (free posting).",
      "Ad Campaigns: click + New campaign, pick a platform, set the name and daily budget, and optionally schedule a launch time. If that platform's credentials aren't set on the server, you'll see the exact missing credential named — nothing is faked.",
      "Organic Posts: select one or more platforms, write the caption, optionally add a media URL, and optionally schedule it. Each platform's publish result is tracked independently — one can succeed while another fails.",
    ],
    note: "To actually connect a platform, the corresponding API credentials need to be set in the server environment (Meta, X, LinkedIn, Google Ads, or TikTok developer keys). Ask if you want help getting a specific platform connected.",
  },
  {
    id: "bots", emoji: "🤖", title: "Bots", tag: "conversation flows",
    what: "Visual, node-based conversation flows — greet a new lead, branch on their reply, hand off to a human agent or an AI agent.",
    steps: [
      "Click + New bot, name it, and set its trigger (e.g. \"new conversation, no agent online\").",
      "Build the flow left to right with + Message, + Condition, + Ai, and + Handoff nodes.",
      "Drag the small link icon on a node to connect it to the next step — the Connections panel on the right lists every wire in the flow.",
      "Toggle the bot ON from the list on the left once it's ready.",
    ],
  },
  {
    id: "inbox", emoji: "💬", title: "Inbox", tag: "team inbox",
    what: "The shared conversation view your team works from — every WhatsApp conversation, filterable and assignable.",
    steps: [
      "Filter by status (All / Open / Pending / Snoozed / Resolved) and by Team / Mine / Unassigned.",
      "Use All tags to narrow by contact tag, or save the current filter combo as a Team View for one-click reuse.",
      "Click a conversation to open it, reply, assign it, or snooze it.",
    ],
  },
  {
    id: "contacts", emoji: "👤", title: "Contacts", tag: "audience",
    what: "Your contact database — stage, tags, and opt-in status, which is what Broadcast segments are built from.",
    steps: [
      "Click + Add contact to add one manually, or import via the API.",
      "Use tags (e.g. vip, delhi) to build custom Broadcast segments later.",
      "Only contacts with Opted in status can legally receive WhatsApp marketing messages.",
    ],
  },
  {
    id: "channels", emoji: "🛰️", title: "Channels", tag: "whatsapp numbers",
    what: "The WhatsApp business phone numbers connected to your account, their connection health and quality rating.",
    steps: [
      "Click + Connect number to add another WhatsApp Business number.",
      "Watch the Quality and Safety score — sending too fast or with poor opt-in hygiene drops these and can get a number restricted.",
      "A new number goes through a warm-up period (shown as \"day X/14\") before it can send at full volume.",
    ],
  },
  {
    id: "analytics", emoji: "📊", title: "Analytics", tag: "reporting",
    what: "Messaging volume, delivery/read rates, estimated conversation cost, and channel split at a glance.",
    steps: [
      "The top cards summarise the last 30 days: messages sent/received, active conversations, delivery and read rate.",
      "The 14-day chart breaks down sent vs. received volume day by day.",
      "Cost mirror is an estimate of Meta's conversation-based pricing for your usage — not a live billing figure.",
    ],
  },
  {
    id: "settings", emoji: "⚙️", title: "Settings & Team Roles", tag: "org · rbac · billing",
    what: "Organization details, branding, team members, functional role permissions, billing plan, and API/webhook keys.",
    steps: [
      "Organization — name, timezone, default language, plan.",
      "Branding — logo and colors shown to your team.",
      "Team & Roles — invite teammates and assign a base role (Owner/Admin/Agent).",
      "Roles & Permissions — fine-grained functional roles (e.g. grant just \"manage_ads\" or \"manage_templates\" to someone without making them a full Admin).",
      "Billing — plan and usage.",
      "API & Webhooks — keys for integrating external systems.",
    ],
  },
];

export function HelpView() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Help &amp; Guide</h1>
      <p className="mb-6 mt-1 text-sm text-zinc-500">
        How to use every feature in Aetos One Chat. Jump to a section below, or click the ❓ Help button on any page.
      </p>

      <nav className="mb-8 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-emerald-400 hover:text-emerald-700">
            {s.emoji} {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-semibold">{s.emoji} {s.title}</h2>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{s.tag}</span>
            </div>
            <p className="mb-3 text-sm text-zinc-500">{s.what}</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-700">
              {s.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            {s.note && (
              <p className="mt-3 rounded-md border-l-2 border-emerald-400 bg-emerald-50 px-3 py-2 text-xs text-zinc-600">{s.note}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
