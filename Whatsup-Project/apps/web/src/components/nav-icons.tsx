"use client";
// Single-stroke vector icon set — scales cleanly at any size, inherits currentColor,
// and replaces the emoji glyphs the nav used to render (which were inconsistent
// across platforms and impossible to tint).
const PATHS: Record<string, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  inbox: "M4 5h16v10H8l-4 4V5Z",
  contacts: "M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1a4 4 0 0 0-3-3.87M16 4.13A4 4 0 0 1 16 11.9",
  companies: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01",
  deals: "M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  broadcasts: "M4 10v4h3l5 4V6l-5 4H4Zm12.5-1.5a4 4 0 0 1 0 7M19 5.5a8 8 0 0 1 0 13",
  templates: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4",
  interactive: "M4 5h16v9H4zM8 18h8M7 9h4M7 11.5h7",
  flows: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  bots: "M8 8h8a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm4 0V4M9.5 13h.01M14.5 13h.01",
  automations: "M4 7h5l3 10h8M4 17h5M16 4l4 3-4 3",
  ads: "M4 9v6h3l6 4V5L7 9H4Zm13-1a5 5 0 0 1 0 8",
  channels: "M9 7V5a3 3 0 0 1 6 0v2M7 7h10v12H7zM12 12v3",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2-1.2l-.3-2.5h-4l-.3 2.5a8 8 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a8.4 8.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2 1.2l.3 2.5h4l.3-2.5a8 8 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2Z",
  help: "M12 17h.01M9.2 9a2.9 2.9 0 1 1 3.8 2.8c-.7.3-1 .9-1 1.7M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  partner: "M8 13 5.5 10.5a2 2 0 0 1 2.8-2.8L12 11l3.7-3.3a2 2 0 0 1 2.8 2.8L16 13m-8 0 4 4 4-4M8 13l4-4",
  plus: "M12 5v14M5 12h14",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  close: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  chevron: "m9 6 6 6-6 6",
  wallet: "M3 8h18v11H3zM3 8V6a1 1 0 0 1 1-1h13M17 13h.01",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6l1-7Z",
  users: "M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const d = PATHS[name] ?? PATHS.dashboard;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
