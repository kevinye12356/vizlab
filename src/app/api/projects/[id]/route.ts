import { NextResponse } from "next/server";
import { deleteProject, getProject, saveProject } from "@/lib/store";
import type { Delivery, HandoffManifest, ProjectStatus } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ ok: false, message: "作品不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ ok: false, message: "作品不存在" }, { status: 404 });
  }

  let body: {
    delivery?: Delivery;
    handoff?: HandoffManifest;
    status?: ProjectStatus;
    title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是合法 JSON" }, { status: 400 });
  }

  const next = {
    ...project,
    title: body.title ?? project.title,
    handoff: body.handoff ?? project.handoff,
    delivery: body.delivery ?? project.delivery,
    status: body.status ?? project.status,
  };

  const saved = await saveProject(next);
  return NextResponse.json({ ok: true, project: saved });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
