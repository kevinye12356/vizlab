import { NextResponse } from "next/server";
import { buildHandoff } from "@/lib/handoff";
import { CompileError, compile } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    question?: string;
    styleId?: string;
    durationTargetSec?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const result = await compile({
      question: body.question ?? "",
      styleId: body.styleId ?? "evidentiary",
      durationTargetSec: body.durationTargetSec,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      handoff: buildHandoff(result.graph, result.storyboard),
    });
  } catch (err) {
    if (err instanceof CompileError) {
      return NextResponse.json(
        { ok: false, code: err.code, message: err.message, suggestions: err.suggestions },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "编译失败" },
      { status: 500 },
    );
  }
}
