import { NextResponse } from "next/server";
import { broadcasts } from "@/lib/mock-data";
import type { Broadcast } from "@/lib/types";

export async function GET() {
  return NextResponse.json([...broadcasts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Broadcast>;
  if (!body.name?.trim() || !body.templateId || !body.segment) {
    return NextResponse.json({ error: "name, templateId, segment required" }, { status: 400 });
  }
  const b: Broadcast = {
    id: `b${Date.now()}`,
    name: body.name.trim(),
    templateId: body.templateId,
    segment: body.segment,
    audienceCount: body.audienceCount ?? 0,
    status: body.scheduledAt ? "scheduled" : "draft",
    scheduledAt: body.scheduledAt ?? null,
    stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
    dailyLimit: body.dailyLimit ?? 250,
    channelId: null,
    funnel: { sent: 0, delivered: 0, read: 0, failed: 0, queued: body.audienceCount ?? 0 },
    kind: body.kind ?? "single",
    smsFallback: body.smsFallback ?? false,
    steps: body.steps ?? [],
    createdAt: new Date().toISOString(),
  };
  broadcasts.unshift(b);
  return NextResponse.json(b, { status: 201 });
}
