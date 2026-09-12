import { NextResponse } from "next/server";
import { contactsFull } from "@/lib/mock-data";
import type { ContactFull } from "@/lib/types";

export async function GET() {
  const sorted = [...contactsFull].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json(sorted);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<ContactFull>;
  if (!body.name?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: "name and phone required" }, { status: 400 });
  }
  const contact: ContactFull = {
    id: `c${Date.now()}`,
    name: body.name.trim(),
    phone: body.phone.trim(),
    email: body.email?.trim() || undefined,
    tags: body.tags ?? [],
    stage: body.stage ?? "lead",
    optIn: body.optIn ?? true,
    createdAt: new Date().toISOString(),
    lastContactedAt: new Date().toISOString(),
  };
  contactsFull.unshift(contact);
  return NextResponse.json(contact, { status: 201 });
}
