import { NextResponse } from "next/server";
import { runAudienceSimulation } from "@/lib/audience";
import type { ConceptGraph, Storyboard } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { graph?: ConceptGraph; storyboard?: Storyboard };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.graph || !body.storyboard) {
    return NextResponse.json(
      { ok: false, message: "缺少概念图或分镜，先完成前面几步" },
      { status: 400 },
    );
  }

  try {
    const report = await runAudienceSimulation(body.graph, body.storyboard);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "观众模拟失败" },
      { status: 500 },
    );
  }
}
