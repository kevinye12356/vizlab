import { NextResponse } from "next/server";
import { hasModel } from "@/lib/deepseek";
import { SEEDS } from "@/lib/seeds";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    modelConfigured: hasModel(),
    seeds: SEEDS.map((s) => ({
      id: s.id,
      label: s.label,
      discipline: s.discipline,
      thesis: s.thesis,
      nodeCount: s.nodes.length,
      edgeCount: s.edges.length,
    })),
  });
}
