"use client";
import Link from "next/link";
import { AreaSpark, BarList, Donut, Ring } from "./charts";
import { Icon } from "@/components/nav-icons";

export type DashboardData = {
  analytics: any | null;
  billing: any | null;
  tasks: any[] | null;
  deals: any | null;
  conversations: any[] | null;
};

export type WidgetDef = {
  type: string;
  title: string;
  icon: string;
  description: string;
  defaultW: number;
  defaultH: number;
  render: (d: DashboardData) => React.ReactNode;
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-20 items-center justify-center text-center text-xs text-zinc-400">{text}</div>;
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="lq-card lq-card-hover group relative overflow-hidden p-4">
      <div className="lq-accent-wash pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs text-zinc-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-zinc-400">{sub}</div>}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-transform duration-300 group-hover:scale-110">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "kpis",
    title: "Headline numbers",
    icon: "bolt",
    description: "Messages, conversations, delivery and read rate at a glance",
    defaultW: 4, defaultH: 1,
    render: (d) => {
      const a = d.analytics;
      if (!a) return <Empty text="No analytics yet." />;
      return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Messages sent" value={String(a.messagesSent ?? 0)} icon="broadcasts" />
          <Stat label="Received" value={String(a.messagesReceived ?? 0)} icon="inbox" />
          <Stat label="Active conversations" value={String(a.activeConversations ?? 0)} icon="contacts" />
          <Stat label="Delivery rate" value={pct(a.deliveryRate)} sub={`Read ${pct(a.readRate)}`} icon="analytics" />
        </div>
      );
    },
  },
  {
    type: "messageTrend",
    title: "Message trend",
    icon: "analytics",
    description: "Sent and received over the last 14 days",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const series: Array<{ date: string; sent: number; received: number }> = d.analytics?.dailySeries ?? [];
      if (!series.length) return <Empty text="No message history yet." />;
      const labels = series.map((s) => s.date.slice(5));
      return (
        <div>
          <AreaSpark points={series.map((s) => s.sent)} labels={labels} height={130} />
          <div className="mt-2 flex gap-4 text-xs text-zinc-500">
            <span><b className="text-zinc-700">{series.reduce((t, s) => t + s.sent, 0)}</b> sent</span>
            <span><b className="text-zinc-700">{series.reduce((t, s) => t + s.received, 0)}</b> received</span>
          </div>
        </div>
      );
    },
  },
  {
    type: "conversationStatus",
    title: "Conversation status",
    icon: "inbox",
    description: "Open, pending, snoozed and resolved",
    defaultW: 1, defaultH: 2,
    render: (d) => {
      const s = d.analytics?.statusBreakdown;
      if (!s) return <Empty text="No conversations yet." />;
      return (
        <Donut size={104} segments={[
          { label: "Open", value: s.open ?? 0, color: "var(--brand-600)" },
          { label: "Pending", value: s.pending ?? 0, color: "#f59e0b" },
          { label: "Snoozed", value: s.snoozed ?? 0, color: "#8b5cf6" },
          { label: "Resolved", value: s.resolved ?? 0, color: "#64748b" },
        ]} />
      );
    },
  },
  {
    type: "wallet",
    title: "Wallet & plan",
    icon: "wallet",
    description: "Balance, plan and spend this month",
    defaultW: 1, defaultH: 2,
    render: (d) => {
      const b = d.billing;
      if (!b) return <Empty text="Billing unavailable." />;
      return (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-zinc-500">Balance</div>
            <div className="text-2xl font-semibold tracking-tight">{rupees(b.walletPaise ?? 0)}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {b.plan?.name ?? "—"}
            </span>
            <span className="text-[11px] text-zinc-400">{b.planCycle}</span>
          </div>
          <div className="text-xs text-zinc-500">
            Spent this month <b className="text-zinc-700">{rupees(b.usageThisMonth?.spentPaise ?? 0)}</b>
          </div>
          <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
            Top up <Icon name="chevron" className="h-3 w-3" />
          </Link>
        </div>
      );
    },
  },
  {
    type: "channelSplit",
    title: "Channel split",
    icon: "channels",
    description: "Where your message volume comes from",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const rows: Array<{ channel: string; count: number }> = d.analytics?.channelSplit ?? [];
      if (!rows.length) return <Empty text="No channel activity yet." />;
      return <BarList items={rows.map((r) => ({ label: r.channel, value: r.count }))} />;
    },
  },
  {
    type: "topCampaigns",
    title: "Top campaigns",
    icon: "broadcasts",
    description: "Delivered, read and click-through",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const rows: Array<{ name: string; delivered: number; read: number; ctr: number }> = d.analytics?.topCampaigns ?? [];
      if (!rows.length) return <Empty text="No campaigns yet." />;
      return (
        <table className="w-full text-left text-xs">
          <thead className="text-zinc-400"><tr><th className="pb-1">Campaign</th><th>Delivered</th><th>Read</th><th>CTR</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-zinc-100">
                <td className="truncate py-1.5 pr-2">{r.name}</td>
                <td>{r.delivered}</td><td>{r.read}</td><td>{Math.round((r.ctr ?? 0) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
  },
  {
    type: "agentLeaderboard",
    title: "Agent leaderboard",
    icon: "users",
    description: "Who is handling the load",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const rows: Array<{ name: string; replies: number; resolved: number }> = d.analytics?.agentLeaderboard ?? [];
      if (!rows.length) return <Empty text="No agent activity in this period." />;
      return <BarList items={rows.map((r) => ({ label: r.name, value: r.replies, hint: `${r.replies} replies · ${r.resolved} resolved` }))} />;
    },
  },
  {
    type: "tasksDue",
    title: "Tasks due",
    icon: "tasks",
    description: "Your open follow-ups, soonest first",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const rows = (d.tasks ?? []).filter((t: any) => t.status !== "done").slice(0, 6);
      if (!rows.length) return <Empty text="Nothing outstanding. " />;
      return (
        <ul className="space-y-1.5">
          {rows.map((t: any) => {
            const overdue = t.dueAt && new Date(t.dueAt) < new Date();
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-red-500" : "bg-emerald-500"}`} />
                <span className="truncate">{t.title}</span>
                <span className={`ml-auto shrink-0 ${overdue ? "text-red-600" : "text-zinc-400"}`}>
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "no date"}
                </span>
              </li>
            );
          })}
        </ul>
      );
    },
  },
  {
    type: "pipeline",
    title: "Sales pipeline",
    icon: "deals",
    description: "Open deal value and win rate",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const p = d.deals;
      if (!p) return <Empty text="No pipeline data." />;
      return (
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-zinc-500">Open value</div>
            <div className="text-2xl font-semibold tracking-tight">{rupees(p.totalOpenValuePaise ?? 0)}</div>
            <div className="mt-1 text-[11px] text-zinc-400">{p.openDealCount ?? 0} open deals</div>
          </div>
          <Ring value={p.winRate90d ?? 0} label="Win rate (90d)" />
        </div>
      );
    },
  },
  {
    type: "recentConversations",
    title: "Recent conversations",
    icon: "inbox",
    description: "Latest threads and who they're waiting on",
    defaultW: 2, defaultH: 2,
    render: (d) => {
      const rows = (d.conversations ?? []).slice(0, 6);
      if (!rows.length) return <Empty text="No conversations yet." />;
      return (
        <ul className="space-y-1.5">
          {rows.map((c: any) => (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className="truncate font-medium">{c.contact?.name ?? c.contactName ?? "Unknown"}</span>
              <span className="truncate text-zinc-400">{c.lastMessage ?? ""}</span>
              {c.slaBreached && <span className="ml-auto shrink-0 rounded bg-red-100 px-1 text-[10px] text-red-700">SLA</span>}
            </li>
          ))}
        </ul>
      );
    },
  },
  {
    type: "quickActions",
    title: "Quick actions",
    icon: "bolt",
    description: "Jump straight into the common jobs",
    defaultW: 1, defaultH: 2,
    render: () => (
      <div className="grid grid-cols-2 gap-2">
        {[
          ["/inbox", "Inbox", "inbox"], ["/broadcasts", "Broadcast", "broadcasts"],
          ["/templates", "Template", "templates"], ["/flows", "Flow", "flows"],
          ["/contacts", "Contact", "contacts"], ["/analytics", "Reports", "analytics"],
        ].map(([href, label, icon]) => (
          <Link key={href} href={href}
            className="lq-ring-focus flex flex-col items-center gap-1 rounded-xl border border-zinc-200 p-2 text-[11px] text-zinc-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-700">
            <Icon name={icon} className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    ),
  },
];

export const WIDGET_BY_TYPE = Object.fromEntries(WIDGETS.map((w) => [w.type, w])) as Record<string, WidgetDef>;
