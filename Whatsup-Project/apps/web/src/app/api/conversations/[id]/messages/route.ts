import { NextResponse } from "next/server";
import { conversations, messages } from "@/lib/mock-data";
import type { Message } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(messages.filter((m) => m.conversationId === id));
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { body } = (await req.json()) as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });
  const msg: Message = {
    id: `m${Date.now()}`,
    conversationId: id,
    direction: "out",
    body: body.trim(),
    status: "sent",
    createdAt: new Date().toISOString(),
  };
  messages.push(msg);
  const conv = conversations.find((c) => c.id === id);
  if (conv) {
    conv.lastMessage = msg.body;
    conv.lastMessageAt = msg.createdAt;
    conv.unread = 0;
  }
  return NextResponse.json(msg, { status: 201 });
}
