"use client";
import type { Bot } from "@/lib/types";

const nodeColor: Record<Bot["nodes"][number]["type"], string> = {
  trigger: "fill-emerald-100 stroke-emerald-400",
  message: "fill-sky-100 stroke-sky-400",
  condition: "fill-amber-100 stroke-amber-400",
  ai: "fill-purple-100 stroke-purple-400",
  handoff: "fill-zinc-200 stroke-zinc-400",
};

export function BotGraph({ bot }: { bot: Bot }) {
  const w = Math.max(...bot.nodes.map((n) => n.x)) + 260;
  const h = Math.max(...bot.nodes.map((n) => n.y)) + 120;
  const byId = new Map(bot.nodes.map((n) => [n.id, n]));

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4">
      <svg width={w} height={h} className="min-w-full">
        {bot.edges.map((e, i) => {
          const a = byId.get(e.from)!, b = byId.get(e.to)!;
          const x1 = a.x + 100, y1 = a.y + 40, x2 = b.x + 100, y2 = b.y;
          const midY = (y1 + y2) / 2;
          return (
            <g key={i}>
              <path d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`} fill="none" stroke="#a1a1aa" strokeWidth={1.5} markerEnd="url(#arrow)" />
              {e.label && <text x={(x1 + x2) / 2} y={midY} fontSize={10} fill="#71717a" textAnchor="middle">{e.label}</text>}
            </g>
          );
        })}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#a1a1aa" />
          </marker>
        </defs>
        {bot.nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <rect width={200} height={80} rx={10} className={nodeColor[n.type]} strokeWidth={1.5} />
            <text x={10} y={20} fontSize={10} className="fill-zinc-500 uppercase">{n.type}</text>
            <text x={10} y={38} fontSize={13} fontWeight={600} className="fill-zinc-800">{n.label}</text>
            <foreignObject x={10} y={44} width={180} height={32}>
              <div className="text-[10px] leading-tight text-zinc-500">{n.detail}</div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </div>
  );
}
