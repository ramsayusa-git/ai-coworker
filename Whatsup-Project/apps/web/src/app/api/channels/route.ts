import { NextResponse } from "next/server";
import { channels } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json(channels);
}
