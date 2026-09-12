import { NextResponse } from "next/server";
import { templates } from "@/lib/mock-data";
import type { Template } from "@/lib/types";

export async function GET() {
  return NextResponse.json([...templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Template>;
  if (!body.name?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "name and body required" }, { status: 400 });
  }
  const vars = Array.from(body.body.matchAll(/\{\{(\w+)\}\}/g)).map((m, i) => m[1] || `var${i + 1}`);
  const tpl: Template = {
    id: `t${Date.now()}`,
    name: body.name.trim(),
    channel: body.channel ?? "whatsapp",
    language: body.language ?? "en",
    category: body.category ?? "utility",
    status: "pending",
    body: body.body.trim(),
    variables: vars,
    updatedAt: new Date().toISOString(),
  };
  templates.unshift(tpl);
  return NextResponse.json(tpl, { status: 201 });
}
