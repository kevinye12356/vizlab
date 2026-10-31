import { runAudit } from "./audit";
import { generateGraph, hasModel } from "./deepseek";
import { SEEDS, matchSeed } from "./seeds";
import { buildStoryboard } from "./storyboard";
import type { AuditReport, ConceptGraph, Storyboard } from "./types";

export type Engine = "seed" | "model";

export interface CompileResult {
  graph: ConceptGraph;
  storyboard: Storyboard;
  audit: AuditReport;
  engine: Engine;
  /** 实际产出这张图的模型，种子模式下为 undefined */
  model?: string;
  elapsedMs: number;
}

export type CompileErrorCode = "NOT_COVERED" | "MODEL_FAILED";

export class CompileError extends Error {
  code: CompileErrorCode;
  suggestions: string[];
  constructor(code: CompileErrorCode, message: string, suggestions: string[] = []) {
    super(message);
    this.code = code;
    this.suggestions = suggestions;
  }
}

/**
 * 编译主流程
 *
 * 命中种子 → 零模型调用，纯本地组装，结果完全可复现。
 * 未命中 → 若配置了模型，走概念抽取；否则明确拒绝并给出已收录范围。
 *
 * 「明确拒绝」是刻意的：宁可告诉用户没收录，也不硬编一个看起来专业的错误答案。
 */
export async function compile(input: {
  question: string;
  styleId: string;
  durationTargetSec?: number;
}): Promise<CompileResult> {
  const started = Date.now();
  const question = input.question.trim();
  if (!question) throw new CompileError("NOT_COVERED", "请先写下一个具体的困惑。");

  const hit = matchSeed(question);
  let graph: ConceptGraph;
  let engine: Engine;
  let model: string | undefined;

  if (hit) {
    graph = {
      question,
      thesis: hit.seed.thesis,
      discipline: hit.seed.discipline,
      nodes: hit.seed.nodes.map((x) => ({ ...x })),
      edges: hit.seed.edges.map((x) => ({ ...x })),
      coverage: "seed",
      // 命中越精确，置信越高。只命中一个机制词时不该给 96% 的自信。
      confidence:
        hit.coreHits.length >= 2
          ? 0.96
          : hit.coreHits.some((k) => k.length >= 4)
            ? 0.88
            : 0.74,
      seedId: hit.seed.id,
      matchedTerms: hit.matched,
    };
    engine = "seed";
  } else if (hasModel()) {
    try {
      const generated = await generateGraph(question);
      graph = generated.graph;
      model = generated.model;
      engine = "model";
    } catch (err) {
      throw new CompileError(
        "MODEL_FAILED",
        err instanceof Error ? err.message : "模型调用失败",
        SEEDS.map((s) => s.label),
      );
    }
  } else {
    throw new CompileError(
      "NOT_COVERED",
      "这个题目还没有收进概念种子库。当前运行在无模型模式，不会编造内容。",
      SEEDS.map((s) => s.label),
    );
  }

  const storyboard = buildStoryboard(graph, {
    styleId: input.styleId,
    durationTargetSec: input.durationTargetSec,
  });
  const audit = runAudit(graph, storyboard);

  return { graph, storyboard, audit, engine, model, elapsedMs: Date.now() - started };
}

export { buildHandoff } from "./handoff";
