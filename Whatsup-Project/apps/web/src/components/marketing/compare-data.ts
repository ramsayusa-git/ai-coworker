export const compareCompetitors = ["Aetos", "Wati", "AiSensy", "Interakt", "Gallabox", "Twilio"] as const;

export type CompareRow = { feature: string; values: string[] }; // ● full · ◐ partial · ○ none

export const compareGroups: { group: string; rows: CompareRow[] }[] = [
  {
    group: "Channels",
    rows: [
      { feature: "Official Meta Cloud API", values: ["●", "●", "●", "●", "●", "●"] },
      { feature: "Quick Connect (QR, no Meta paperwork)", values: ["●", "○", "○", "○", "○", "○"] },
      { feature: "Multiple numbers per org", values: ["●", "◐", "◐", "●", "●", "●"] },
      { feature: "0% message markup", values: ["●", "○ ~20%", "◐", "○ ~25%", "◐", "○"] },
    ],
  },
  {
    group: "Team inbox",
    rows: [
      { feature: "Unlimited agents (no per-seat cost)", values: ["●", "○", "●", "○", "○", "○"] },
      { feature: "Assignment rules (round-robin/skills/team)", values: ["●", "◐", "◐", "◐", "◐", "◐"] },
      { feature: "Chat-history import from phone", values: ["●", "○", "○", "○", "○", "○"] },
    ],
  },
  {
    group: "Marketing & automation",
    rows: [
      { feature: "Broadcasts with A/B + retargeting", values: ["●", "◐", "●", "◐", "◐", "○"] },
      { feature: "No-code visual bot builder", values: ["●", "●", "●", "◐", "●", "○"] },
      { feature: "AI agent with RAG on your knowledge base", values: ["●", "◐", "◐", "○", "○", "○"] },
      { feature: "Click-to-WhatsApp ads manager", values: ["●", "●", "●", "◐", "◐", "○"] },
    ],
  },
  {
    group: "Social & unique",
    rows: [
      { feature: "WhatsApp Channels (newsletter) publisher", values: ["●", "○", "○", "○", "○", "○"] },
      { feature: "Groups / communities manager", values: ["●", "○", "○", "○", "○", "○"] },
      { feature: "Status / story scheduler", values: ["●", "○", "○", "○", "○", "○"] },
    ],
  },
  {
    group: "Commerce & billing",
    rows: [
      { feature: "Catalog, cart, orders, WhatsApp Pay", values: ["●", "◐", "◐", "●", "◐", "○"] },
      { feature: "India GST invoicing", values: ["●", "●", "●", "●", "◐", "○"] },
    ],
  },
  {
    group: "Partner & enterprise",
    rows: [
      { feature: "Full white-label + custom domain", values: ["●", "○", "○", "○", "○", "○"] },
      { feature: "Wholesale billing + rev-share ledger", values: ["●", "◐", "◐", "○", "○", "○"] },
      { feature: "Best-in-class docs/SDKs", values: ["◐", "○", "○", "○", "○", "●"] },
      { feature: "SSO/SAML, ISO 27001", values: ["◐ roadmap", "○", "○", "○", "○", "●"] },
    ],
  },
];
