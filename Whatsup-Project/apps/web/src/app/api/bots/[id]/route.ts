import { NextResponse } from "next/server";
import { bots } from "@/lib/mock-data";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { enabled } = (await req.json()) as { enabled: boolean };
  const bot = bots.find((b) => b.id === id);
  if (!bot) return NextResponse.json({ error: "not found" }, { status: 404 });
  bot.enabled = enabled;
  return NextResponse.json(bot);
}
