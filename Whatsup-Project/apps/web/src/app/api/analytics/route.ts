import { NextResponse } from "next/server";
import { analyticsSummary } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json(analyticsSummary);
}
