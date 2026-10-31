// VIZLAB 领域模型
// 设计原则：所有中间产物都是结构化、可编辑、可持久化的对象，
// 而不是一段不可回退的自然语言文本。

export type Relation = "causes" | "enables" | "contrasts" | "feedback";

export const RELATION_LABEL: Record<Relation, string> = {
  causes: "导致",
  enables: "促成",
  contrasts: "反差",
  feedback: "反噬",
};

/** 概念节点：知识的最小可编译单元 */
export interface ConceptNode {
  id: string;
  name: string;
  discipline: string;
  /** 一句话定义，不超过 40 字 */
  definition: string;
  /** 机制：为什么会这样 */
  mechanism: string;
  /** 常见误解：视频里可以被"打脸"的点 */
  misconception: string;
  /** 可视化抓手：这个概念里什么能被看见 */
  visualHook: string;
  /** 旁白稿（≤42 字，受语速约束） */
  narration: string;
  /** 画面内容（与视觉风格解耦，由风格层再加工） */
  visual: string;
  /** 屏幕字，3~8 字 */
  onScreen: string;
  /**
   * 原句出处：这个概念是从用户原话的哪一段推出来的，必须能逐字在问题里找到。
   * 这是「自然语言 → 概念」这个转化的可视化依据，不是装饰。
   */
  sourceQuote?: string;
}

/** 概念之间的有向边，是叙事骨架的原材料 */
export interface ConceptEdge {
  from: string;
  to: string;
  relation: Relation;
  label: string;
}

/** 覆盖度：决定这个方案是"编译"还是"生成" */
export type Coverage = "seed" | "augmented" | "generated";

export interface ConceptGraph {
  question: string;
  /** 一句话论点：整条视频要证明的那句话（≤40 字，因为它就是开场旁白） */
  thesis: string;
  /** 学术争议限定说明。论点本身必须短，限定语放这里，不塞进旁白 */
  hedge?: string;
  discipline: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  coverage: Coverage;
  confidence: number;
  seedId?: string;
  /** 命中的种子关键词，用于向用户解释"为什么抽到这些概念" */
  matchedTerms: string[];
}

export interface PaletteEntry {
  name: string;
  hex: string;
  role: string;
}

/** 视觉风格 = 一套可执行的规格，不是形容词 */
export interface VisualStyle {
  id: string;
  name: string;
  tagline: string;
  baseMedium: string;
  palette: PaletteEntry[];
  camera: string;
  transition: string;
  typography: string;
  texture: string;
  negative: string;
  bestFor: string;
  /** 平均每镜秒数，用于节奏测算 */
  paceSec: number;
}

export type Act = 1 | 2 | 3;

export interface Shot {
  index: number;
  act: Act;
  /** 屏幕字在第几秒弹出。0 表示整镜都在。这是分镜才有的信息，概念层没有 */
  onScreenAt: number;
  /** 这一镜在叙事上承担什么 */
  beat: string;
  durationSec: number;
  conceptId: string;
  conceptName: string;
  visual: string;
  narration: string;
  onScreen: string;
  camera: string;
  transition: string;
}

export interface Storyboard {
  styleId: string;
  durationTargetSec: number;
  shots: Shot[];
  totalSec: number;
  /** 骨架从哪来，用于证明是算法推导 */
  derivedFrom: string;
}

export type FindingLevel = "pass" | "warn" | "fail";

export interface AuditFinding {
  id: string;
  level: FindingLevel;
  category: string;
  title: string;
  detail: string;
  metric?: string;
  /** 判定依据，展示确定性 */
  rule: string;
}

export interface AuditReport {
  score: number;
  findings: AuditFinding[];
  passed: number;
  warned: number;
  failed: number;
  generatedAt: string;
}

export interface HandoffShot {
  index: number;
  durationSec: number;
  prompt: string;
  camera: string;
  transition: string;
}

/** 交接包：VIZLAB 不生成视频，输出的是这份可执行规格 */
export interface HandoffManifest {
  version: string;
  target: string;
  model: string;
  outputSpec: {
    aspect: string;
    resolution: string;
    fps: number;
    totalSec: number;
  };
  styleRef: {
    id: string;
    name: string;
    palette: string[];
    baseMedium: string;
    typography: string;
    negative: string;
  };
  shots: HandoffShot[];
  acceptance: string[];
  disclaimer: string;
}

export type ProjectStatus = "draft" | "handoff" | "delivered";

export interface Delivery {
  source: string;
  durationSec: number;
  publishedAt?: string;
  /** 回执偏差：真实成片与规格的偏离 */
  deviations: { shotIndex: number; note: string }[];
  note: string;
}

export interface Project {
  id: string;
  title: string;
  question: string;
  graph: ConceptGraph;
  styleId: string;
  storyboard: Storyboard;
  audit: AuditReport;
  status: ProjectStatus;
  handoff?: HandoffManifest;
  delivery?: Delivery;
  createdAt: string;
  updatedAt: string;
}

/* ---------------- 观众模拟 ---------------- */

/**
 * 结构性提示：纯算法发现的问题，零模型调用，跑两次结果一致。
 * 这是观众预演里可信度最高的那一部分。
 */
export interface StructuralNote {
  id: string;
  shotIndex: number;
  kind: "prereq" | "count-mismatch" | "hook-overload";
  title: string;
  detail: string;
  patch: string;
  /** 可以直接替换上去的新旁白；无法自动修补时为空 */
  rewrite?: string;
}

/** 单镜的观众理解状态 */
export interface AudienceProbe {
  shotIndex: number;
  conceptName: string;
  /** 理解度估计 0~100。这是模型的估计，不是测量 */
  comprehension: number;
  stuck: string;
  question: string;
  missingPrereq: string;
  patch: string;
  /** 可以直接替换上去的新旁白；模型没能给出可执行改法时为空 */
  rewrite?: string;
  /** 这条卡点有没有确定性依据 */
  evidence: "deterministic" | "estimated" | "ok";
}

export interface AudienceReport {
  persona: string;
  level: string;
  probes: AudienceProbe[];
  endingComprehension: number;
  worstShot: number | null;
  worstDrop: number;
  /** 纯算法算出来的结构性提示，零模型调用 */
  notes: StructuralNote[];
  /** 走的是模型路径还是仅确定性路径 */
  mode: "model" | "deterministic-only";
  model?: string;
  generatedAt: string;
}
