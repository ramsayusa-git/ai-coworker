import { NextResponse } from "next/server";
import { contactsFull } from "@/lib/mock-data";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const idx = contactsFull.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  contactsFull.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
