import { NextResponse } from "next/server";
import { conversations } from "@/lib/mock-data";

export async function GET() {
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return NextResponse.json(sorted);
}
