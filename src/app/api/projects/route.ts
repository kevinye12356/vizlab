import { NextResponse } from "next/server";
import { listProjects, newId, saveProject } from "@/lib/store";
import type { AuditReport, ConceptGraph, HandoffManifest, Project, Storyboard } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const items = await listProjects();
  return NextResponse.json({
    ok: true,
    projects: items.map((p) => ({
      id: p.id,
      title: p.title,
      question: p.question,
      styleId: p.styleId,
      status: p.status,
      score: p.audit.score,
      coverage: p.graph.coverage,
      shotCount: p.storyboard.shots.length,
      totalSec: p.storyboard.totalSec,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  let body: {
    title?: string;
    graph?: ConceptGraph;
    styleId?: string;
    storyboard?: Storyboard;
    audit?: AuditReport;
    handoff?: HandoffManifest;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.graph || !body.storyboard || !body.audit) {
    return NextResponse.json(
      { ok: false, message: "缺少编译产物，无法归档" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const first = body.graph.nodes[0]?.name;
  const last = body.graph.nodes[body.graph.nodes.length - 1]?.name;
  const autoTitle =
    first && last ? `${first} → ${last}` : body.graph.question.slice(0, 24);

  const project: Project = {
    id: newId(),
    title: body.title?.trim() || autoTitle,
    question: body.graph.question,
    graph: body.graph,
    styleId: body.styleId ?? body.storyboard.styleId,
    storyboard: body.storyboard,
    audit: body.audit,
    status: body.handoff ? "handoff" : "draft",
    handoff: body.handoff,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await saveProject(project);
  return NextResponse.json({ ok: true, project: saved });
}
