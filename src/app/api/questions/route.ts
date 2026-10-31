import { NextResponse } from "next/server";
import { getQuestions } from "@/lib/questions";

export const runtime = "nodejs";

export async function GET() {
  const result = await getQuestions();
  return NextResponse.json({ ok: true, ...result });
}
