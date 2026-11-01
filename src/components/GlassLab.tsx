"use client";

/**
 * VIZLAB · 玻璃实验室
 * 输入一句科普问题 → 实时识别结构 → 编译转场 → 概念图 / 分镜 / 可执行提示词
 *
 * 预留接口（当前为本地 mock，接入后端后替换实现即可）：
 *   analyze(text)            —— 实时结构识别
 *   compile(text, options)   —— 编译为概念图 + 分镜 + 提示词
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  AudienceReport,
  AuditReport,
  ConceptGraph,
  Coverage,
  HandoffManifest,
  Storyboard,
} from "@/lib/types";

/* ================= 类型 ================= */

type MotionMode = "full" | "simple";
type Phase = "landing" | "compiling" | "result" | "error";
type Abstraction = 0 | 1 | 2;
type Mark = "qt" | "cond" | "phen";
type Stage = 0 | 1 | 2 | 3 | 4;

interface CompileOptions {
  audience: string;
  duration: string;
  output: string;
}
interface Recognition {
  questionType: string;
  condition: string;
  phenomenon: string;
}
interface Seg {
  text: string;
  mark?: Mark;
}

/* ================= mock 数据（与设计稿一致） ================= */

const EXAMPLE = "为什么天一冷就想尿尿？";

const EXAMPLES = [
  "为什么天一冷就想尿尿？",
  "为什么越熬夜越睡不着？",
  "抗生素为什么要吃满疗程？",
  "为什么冰是滑的？",
  "为什么猫的呼噜声让人放松？",
  "为什么飞机那么重还能飞？",
  "为什么海水是咸的？",
];

const KEYWORDS: Array<{ w: string; cat: Mark }> = [
  { w: "什么原因", cat: "qt" }, { w: "怎么会", cat: "qt" },
  { w: "为什么", cat: "qt" }, { w: "为何", cat: "qt" },
  { w: "天气变冷", cat: "cond" }, { w: "天一冷", cat: "cond" },
  { w: "熬夜", cat: "cond" }, { w: "感冒", cat: "cond" },
  { w: "喝酒", cat: "cond" }, { w: "紧张", cat: "cond" },
  { w: "冬天", cat: "cond" }, { w: "夏天", cat: "cond" }, { w: "一热", cat: "cond" },
  { w: "打喷嚏", cat: "phen" }, { w: "睡不着", cat: "phen" },
  { w: "想尿尿", cat: "phen" }, { w: "更精神", cat: "phen" },
  { w: "吃满疗程", cat: "phen" }, { w: "犯困", cat: "phen" },
  { w: "发抖", cat: "phen" }, { w: "脸红", cat: "phen" }, { w: "尿多", cat: "phen" },
];

const GROUPS: Array<{
  key: "audience" | "duration" | "output";
  label: string;
  options: string[];
}> = [
  { key: "audience", label: "受众", options: ["大众", "儿童", "进阶"] },
  { key: "duration", label: "时长", options: ["30s", "45s", "60s", "90s"] },
  { key: "output", label: "产出", options: ["分镜 + 提示词", "仅提示词", "完整方案"] },
];

/* 三档抽象的说明。不能写具体的学科语境 —— 编译对象可能是植物学、
   大气光学或生理学，写死"身体里的…"放到叶子上就不对了。 */
const ABS: Array<{ name: string; hint: string }> = [
  { name: "具体", hint: "最直白的一句话，不出现术语" },
  { name: "机制", hint: "概念之间谁导致谁" },
  { name: "原理", hint: "学科视角下的定义与机制" },
];

interface GNode {
  id: string;
  labels: [string, string, string];
  x: number;
  y: number;
  start?: boolean;
  terminal?: boolean;
  missing?: boolean;
  bypass?: boolean;
}
interface GEdge {
  from: string;  to: string;
  vertical?: boolean;
  dashed?: boolean;
  amber?: boolean;
  path?: string;
}
interface DragState {
  id: string;
  dx: number;
  dy: number;
  active: boolean;
}
/* 拖动时相连节点的阻尼牵引系数：被拖的走满，直接相连的跟一点，
   整条链看起来是"被拎起来"的，而不是每个方块各自脱开。 */
const DRAG_DAMP = 0.18;
/* 拖动的视觉位移封顶。这里是"调档"不是"摆积木"：
   真按手指距离移动，第一行的节点往上拖 70px 就冲出面板被裁掉了。
   手势仍按真实位移判定，只是画面上最多抬 26px。 */
const DRAG_VIS_Y = 26;
const DRAG_VIS_X = 30;

const NODE_W = 200;
const NODE_H = 84;
const GRAPH_W = 1160;
const GRAPH_H = 500;

const NODES: GNode[] = [
  { id: "n1", labels: ["天气变冷", "气温下降", "冷刺激被体表感受"], x: 20, y: 24, start: true },
  { id: "n2", labels: ["皮肤门关小", "体表血管收缩", "外周血管收缩"], x: 310, y: 24 },
  { id: "n3", labels: ["血液往里躲", "血液回流核心", "血流中枢再分布"], x: 600, y: 24 },
  { id: "n4", labels: ["核心水变多", "中心血容量上升", "有效循环血量 ↑"], x: 890, y: 24 },
  { id: "n5", labels: ["节水信号变弱", "抗利尿激素分泌减少", "ADH（血管加压素）↓"], x: 890, y: 352, missing: true },
  { id: "n6", labels: ["水不回收了", "肾小管重吸收减少", "集合管水重吸收 ↓"], x: 600, y: 352 },
  { id: "n7", labels: ["水库更快装满", "膀胱充盈加快", "牵张感受器提前触发"], x: 310, y: 352 },
  { id: "n8", labels: ["想上厕所", "产生尿意", "排尿反射启动"], x: 20, y: 352, terminal: true },
  { id: "b1", labels: ["出汗减少", "出汗减少", "不显性蒸发 ↓"], x: 430, y: 190, bypass: true },
];

const EDGES: GEdge[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
  { from: "n3", to: "n4" },
  { from: "n4", to: "n5", vertical: true },
  { from: "n5", to: "n6" },
  { from: "n6", to: "n7" },
  { from: "n7", to: "n8", amber: true },
  { from: "b1", to: "n6", dashed: true, path: "M 510 246 C 530 302, 620 306, 658 350" },
];

interface Shot {
  no: string;
  type: string;
  dur: number;
  text: string;
  tone?: "cyan" | "amber";
  /** 这一镜讲的是哪个概念（用于把详略权重对回具体的环） */
  conceptId?: string;
}

const SHOTS: Shot[] = [
  { no: "01", type: "全景", dur: 3, text: "雪夜窗前，呵气成霜，人物裹紧外套" },
  { no: "02", type: "特写", dur: 4, text: "手指贴上冰凉玻璃，皮肤泛起鸡皮疙瘩" },
  { no: "03", type: "示意", dur: 6, text: "体表血管收缩动画，血液流向身体核心" },
  { no: "04", type: "示意", dur: 5, text: "中心血容量上升，压力感受器被拉伸" },
  { no: "05", type: "动画", dur: 6, text: "ADH 分泌曲线掉头向下（关键转折）", tone: "cyan" },
  { no: "06", type: "示意", dur: 6, text: "肾小管重吸收减少，原尿悄悄变多" },
  { no: "07", type: "特写", dur: 4, text: "膀胱充盈加快，压力信号提前上传" },
  { no: "08", type: "全景", dur: 4, text: "收束：身体的节水阀被悄悄关小", tone: "amber" },
];

// 编译转场用的四槽链：两端是"用户自己的词"，中间是产品补出来的环节。
// 取真实 NODES 的机制档文案，第 3 槽用 missing 节点（全片情绪峰值）。
const CHAIN: ChainItem[] = [
  { id: "n1", kind: "start", from: "condition" },
  { id: "n2", kind: "mid" },
  { id: "n5", kind: "star" },
  { id: "n8", kind: "terminal", from: "phenomenon" },
];

const FLOATS = [
  { t: "为什么海水是咸的？", x: 4, y: 17, r: -4, d: 0 },
  { t: "为什么猫打呼噜？", x: 83, y: 11, r: 3, d: -3 },
  { t: "为什么冰是滑的？", x: 3, y: 62, r: 3, d: -6 },
  { t: "为什么越熬夜越精神？", x: 84, y: 56, r: -3, d: -1.5 },
  { t: "抗生素为什么要吃满疗程？", x: 9, y: 86, r: -2, d: -8 },
  { t: "为什么飞机能飞？", x: 77, y: 83, r: 4, d: -5 },
];

/* ================= 识别与高亮 ================= */

/** 预留接口 analyze(text)：当前为本地规则模拟，接入后端后替换为 fetch("/api/analyze") */
function analyze(text: string): Recognition | null {
  if (!text.trim()) return null;
  const pick = (cat: Mark) => {
    const hit = KEYWORDS.filter((k) => k.cat === cat && text.includes(k.w)).sort(
      (a, b) => b.w.length - a.w.length,
    )[0];
    return hit?.w ?? "";
  };
  const questionType = pick("qt");
  const condition = pick("cond");
  const phenomenon = pick("phen");
  if (!questionType && !condition && !phenomenon) return null;
  return { questionType, condition, phenomenon };
}

/**
 * 兜底：识别不到「条件 / 现象」时，把用户原句切成两段来飞。
 * 词仍然是用户自己的话，只是没做语义分类 —— 保证任何输入都有东西可飞。
 * 真实接口的 sourceQuote（后端已按"原句出处"设计）接上后即替换这里。
 */
function splitSentence(q: string): [string, string] {
  const clean = q
    .replace(/^(为什么|为何|怎么会|什么原因|怎么)/, "")
    .replace(/[？?！!。.\s]/g, "");
  if (!clean) return ["", ""];
  // 优先标点分句
  const seg = clean.split(/[，,、；;：:]/).filter(Boolean);
  if (seg.length >= 2) return [seg[0], seg.slice(1).join("")];
  // 其次在常见的"主语 / 谓语"分界字处切 —— 比按中点硬切自然
  const m = clean.match(/^(.*?)([是为的会能要在有把被].*)$/);
  if (m) return [m[1], m[2]];
  const mid = Math.ceil(clean.length / 2);
  return [clean.slice(0, mid), clean.slice(mid)];
}

/** 最左优先 + 最长优先的关键词切分，用于彩色下划线 mirror 层 */
function segmentText(text: string): Seg[] {
  const sorted = [...KEYWORDS].sort((a, b) => b.w.length - a.w.length);
  const hits = new Map<number, { len: number; cat: Mark }>();
  for (const { w, cat } of sorted) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(w, from);
      if (idx < 0) break;
      const cur = hits.get(idx);
      if (!cur || w.length > cur.len) hits.set(idx, { len: w.length, cat });
      from = idx + 1;
    }
  }
  const spans = [...hits.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, { len, cat }]) => ({ start, len, cat }));
  const out: Seg[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue; // 跳过重叠
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.start + s.len), mark: s.cat });
    pos = s.start + s.len;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/* ================= 真实编译结果 → 视图模型 =================
   后端 /api/compile 返回的是领域模型（ConceptGraph / Storyboard），
   与画布需要的视图模型（坐标、三档抽象、短标签）不同。
   这一层只做映射，不造内容：所有文案都取自后端已有字段。

   三档抽象直接落在后端既有字段上，不另写文案：
     具体 = onScreen（3~8 字，最口语）／机制 = name／原理 = definition
   后端还为每个概念给出 sourceQuote（原句出处），下一轮用于节点溯源展示。 */

interface CompileOk {
  ok: true;
  graph: ConceptGraph;
  storyboard: Storyboard;
  audit: AuditReport;
  engine: string;
  model?: string;
  handoff?: HandoffManifest;
}
/** 422：NOT_COVERED（未收录）/ MODEL_FAILED（模型失败）——必须诚实呈现，不许编造 */
interface CompileErr {
  ok: false;
  code: string;
  message: string;
  suggestions?: string[];
}
type CompileResponse = CompileOk | CompileErr;

type ChainKind = "start" | "mid" | "star" | "terminal";
interface ChainItem {
  id: string;
  kind: ChainKind;
  from?: "condition" | "phenomenon";
}

interface CompileView {
  nodes: GNode[];
  edges: GEdge[];
  shots: Shot[];
  chain: ChainItem[];
  prompt: string;
  thesis: string;
  discipline: string;
  totalSec: number;
  coverage: Coverage;
  auditScore?: number;
  /** 概念图画布尺寸（随节点数收紧，避免留白） */
  gw: number;
  gh: number;
  /** 原始领域模型：观众预演接口需要它原样回传 */
  raw: { graph: ConceptGraph; storyboard: Storyboard };
  /** 交付画幅规格（「完整方案」才展示） */
  spec?: { aspect: string; resolution: string; fps: number };
}

const ROW_STEP = 328; // 内置示例（8 节点）使用的行距
/* 真实编译产物通常只有 5~6 个节点。若沿用固定 1160×500 画布与 480px 列距，
   横向与纵向都会空掉一大片 —— 所以画布尺寸随节点数收紧。 */
const PAD = 28; // 画布内边距：给悬停发光与连线弧线留空间
const GAP_X_MAX = 150;
const GAP_Y = 150;

interface Layout {
  w: number;
  h: number;
  pos: Array<{ x: number; y: number }>;
}

/* 核验用（由 ?slow= / ?api= 注入，正常使用下就是默认值）：
   slow 让请求人为延后，用来观察「推演中」等待态；
   api  换成坏路径，用来观察失败态。headless 抓不到"网络 pending 中"的帧，
   所以只能这样把等待窗口拉开。 */
let DEBUG_API = "/api/compile";
let DEBUG_SLOW = 0;

/**
 * 核验钩子的总开关：只有带 ?debug=1 时才认其余参数。
 *
 * 为什么必须加这一层：?auto=1 会让页面**自动编译一个示例问题**（?q= 没给时就是
 * 内置的「为什么天一冷就想尿尿？」）。这类链接一旦被当成正常入口打开，用户会
 * 看到网站「不管问什么都答尿尿」—— 那不是产品行为，是我核验时留下的地址。
 * 把开关收到 debug 后面，带参链接就退回普通页面。
 */
function debugParams(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  return p.get("debug") === "1" ? p : null;
}

/**
 * serpentine 布局：每行最多 4 个，奇数行反向。
 * 画布宽高由实际占位推导（而不是写死 1160×500），
 * 这样 5~6 个节点的真实结果不会有半屏空白。
 */
function layoutOf(count: number, avail: number): Layout {
  if (count <= 0) return { w: Math.min(avail, GRAPH_W), h: 200, pos: [] };
  const rows = Math.max(1, Math.ceil(count / 4));
  const cols = Math.ceil(count / rows);
  /* 列距在 20~150 之间按可用宽度收紧：窄容器里如果还保留 150px 列距，
     最右一列会被 overflow 裁掉。 */
  const gapX =
    cols > 1
      ? Math.max(20, Math.min(GAP_X_MAX, (avail - PAD * 2 - cols * NODE_W) / (cols - 1)))
      : 0;
  const gapY = rows > 1 ? GAP_Y : 0;
  const innerW = cols * NODE_W + (cols - 1) * gapX;
  const innerH = rows * NODE_H + (rows - 1) * gapY;
  const pos = Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols);
    const k = i % cols;
    const c = r % 2 === 0 ? k : cols - 1 - k;
    return {
      x: Math.round(PAD + c * (NODE_W + gapX)),
      y: Math.round(PAD + r * (NODE_H + gapY)),
    };
  });
  return { w: Math.round(innerW + PAD * 2), h: Math.round(innerH + PAD * 2), pos };
}

function toNodes(g: ConceptGraph, lay: Layout): GNode[] {
  const pos = lay.pos;
  // 「缺失环节」= 链条中段那个概念。它承担转场里的情绪峰值，位置由长度推导
  const mid = g.nodes.length >= 3 ? Math.floor((g.nodes.length - 1) / 2) : -1;
  return g.nodes.map((n, i) => ({
    id: n.id,
    labels: [n.onScreen, n.name, n.definition],
    x: pos[i].x,
    y: pos[i].y,
    start: i === 0,
    terminal: i === g.nodes.length - 1,
    missing: i === mid,
  }));
}

function toEdges(g: ConceptGraph, nodes: GNode[]): GEdge[] {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const last = nodes.length - 1;
  return g.edges
    .filter((e) => idx.has(e.from) && idx.has(e.to))
    .map((e) => ({
      from: e.from,
      to: e.to,
      // 反差/反噬不是主因果链，走虚线
      dashed: e.relation === "contrasts" || e.relation === "feedback",
      amber: idx.get(e.to) === last,
    }));
}

function toShots(sb: Storyboard): Shot[] {
  const last = sb.shots.length - 1;
  const key = Math.floor(last / 2);
  return sb.shots.map((s, i) => ({
    no: String(i + 1).padStart(2, "0"),
    // 叙事功能（beat）冒号前的那半句就是这类分镜的短标签
    type: (s.beat.split(/[:：]/)[0] || "分镜").slice(0, 6),
    dur: Math.round(s.durationSec),
    text: s.narration || s.visual,
    conceptId: s.conceptId,
    tone: i === last ? "amber" : i === key ? "cyan" : undefined,
  }));
}

/** 转场四槽用的链条：首槽/末槽是「你的词」，中间是产品补出来的环节。最多 5 槽。 */
function toChain(nodes: GNode[]): ChainItem[] {
  const n = nodes.length;
  if (!n) return [];
  const MAX = 5;
  const idx =
    n <= MAX
      ? nodes.map((_, i) => i)
      : Array.from({ length: MAX }, (_, k) => Math.round((k * (n - 1)) / (MAX - 1)));
  const uniq = [...new Set(idx)];
  return uniq.map((i, k) => ({
    id: nodes[i].id,
    kind:
      k === 0 ? "start" : k === uniq.length - 1 ? "terminal" : nodes[i].missing ? "star" : "mid",
    from: k === 0 ? "condition" : k === uniq.length - 1 ? "phenomenon" : undefined,
  }));
}

/** 提示词由本次真实因果链生成；保留 ${变量} 字面供高亮与复制时替换 */
function buildRealTemplate(g: ConceptGraph, sb: Storyboard): string {
  const chain = g.nodes.map((n) => n.name).join(" → ");
  return `你是科普视频导演。请为主题「${g.question}」制作一支 \${时长} 的\${受众}向科普短视频。

【论点】${g.thesis}
【学科】${g.discipline}
【现象】\${现象}
【条件】\${条件}
【核心机制】${chain}
【抽象层级】\${抽象层级}
【分镜】共 ${sb.shots.length} 镜 / 总时长 ${sb.totalSec}s；每镜标注 景别 · 时长 · 画面 · 旁白
【输出 JSON】{ title, hooks: [${sb.shots.length} items], shots: [{ no, scene, duration, visual }] }`;
}

function adaptCompile(r: CompileOk): CompileView {
  /* 坐标只是一份按默认宽度排的初值 —— 真正的位置取决于容器可用宽度，
     由组件按视口重算（见 graphNodes），否则窄窗口里最右一列会被裁掉。 */
  const lay = layoutOf(r.graph.nodes.length, GRAPH_W);
  const nodes = toNodes(r.graph, lay);
  return {
    nodes,
    gw: lay.w,
    gh: lay.h,
    raw: { graph: r.graph, storyboard: r.storyboard },
    spec: r.handoff?.outputSpec
      ? {
          aspect: r.handoff.outputSpec.aspect,
          resolution: r.handoff.outputSpec.resolution,
          fps: r.handoff.outputSpec.fps,
        }
      : undefined,
    edges: toEdges(r.graph, nodes),
    shots: toShots(r.storyboard),
    chain: toChain(nodes),
    prompt: buildRealTemplate(r.graph, r.storyboard),
    thesis: r.graph.thesis,
    discipline: r.graph.discipline,
    totalSec: r.storyboard.totalSec,
    coverage: r.graph.coverage,
    auditScore: r.audit?.score,
  };
}

/* ================= 概念图几何 ================= */

function nodeById(nodes: GNode[], id: string): GNode | undefined {
  return nodes.find((n) => n.id === id);
}

function edgePath(e: GEdge, nodes: GNode[], drag?: DragState | null): string {
  if (e.path) return e.path;
  const a = nodeById(nodes, e.from);
  const b = nodeById(nodes, e.to);
  if (!a || !b) return "";
  /* 位移场：被拖的节点走满位移，同一条边的另一端按阻尼跟随。
     连线和方块用同一套偏移，整条因果链才是"连在一起被拉动"。 */
  const delta = (id: string) => {
    if (!drag?.active) return { x: 0, y: 0 };
    if (id === drag.id) {
      return {
        x: Math.max(-DRAG_VIS_X, Math.min(DRAG_VIS_X, drag.dx * 0.4)),
        y: Math.max(-DRAG_VIS_Y, Math.min(DRAG_VIS_Y, drag.dy)),
      };
    }
    const touches = e.from === drag.id || e.to === drag.id;
    return touches ? { x: drag.dx * DRAG_DAMP, y: drag.dy * DRAG_DAMP } : { x: 0, y: 0 };
  };
  const da = delta(a.id);
  const db = delta(b.id);
  const ax = a.x + da.x;
  const bx = b.x + db.x;
  const ay = a.y + da.y + NODE_H / 2;
  const by = b.y + db.y + NODE_H / 2;
  if (e.vertical) {
    const x1 = ax + NODE_W;
    const x2 = bx + NODE_W;
    return `M ${x1} ${ay} C ${x1 + 60} ${ay}, ${x2 + 60} ${by}, ${x2} ${by}`;
  }
  // 跨行且同列。同列判断必须用【原始】坐标：拖动时两端偏移量不同
  // （被拖的走满、另一端只跟随 0.18），若拿偏移后的坐标判断，原本的
  // 竖直连线会被误判成水平线、转头跑到图的另一侧去。
  if (Math.abs(a.x - b.x) < 1) {
    const x1 = a.x + da.x + NODE_W / 2;
    const x2 = b.x + db.x + NODE_W / 2;
    const top = a.y + da.y + NODE_H;
    const bottom = b.y + db.y;
    const my = (top + bottom) / 2;
    return `M ${x1} ${top} C ${x1} ${my}, ${x2} ${my}, ${x2} ${bottom}`;
  }
  if (bx > ax) {
    const x1 = ax + NODE_W;
    const x2 = bx;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${x2} ${by}`;
  }
  // 奇数行内部是从右往左，线要从左边出去接右边
  const x1 = ax;
  const x2 = bx + NODE_W;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${x2} ${by}`;
}

/* ================= 观众预演 · 理解度曲线 ================= */

const CH_W = 920; // 曲线画布（viewBox 坐标，实际按容器宽度等比缩放）
const CH_H = 180;
const CH_PX = 38; // 左右留白，给首末镜的标签
const CH_PY = 26;

interface ChartPoint {
  x: number;
  y: number;
  i: number;
  probe: AudienceReport["probes"][number];
}

/** x 按镜序均分，y 把 0~100 的理解度映射到画布高度 */
function chartPoints(probes: AudienceReport["probes"]): ChartPoint[] {
  const n = probes.length;
  const innerW = CH_W - CH_PX * 2;
  const innerH = CH_H - CH_PY * 2;
  return probes.map((probe, i) => {
    const v = Math.max(0, Math.min(100, probe.comprehension));
    return {
      probe,
      i,
      x: CH_PX + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1)),
      y: CH_PY + (1 - v / 100) * innerH,
    };
  });
}

/* ================= 提示词模板 ================= */

function buildTemplate(q: string): string {
  return `你是科普视频导演。请为主题「${q}」制作一支 \${时长} 的\${受众}向科普短视频。

【现象】\${现象}
【条件】\${条件}
【核心机制】气温下降 → 体表血管收缩 → 血液回流核心 → 中心血容量上升 → 抗利尿激素分泌减少 → 肾小管重吸收减少 → 膀胱充盈加快 → 产生尿意
【旁路】出汗减少（同向增强）
【抽象层级】\${抽象层级}
【分镜】每镜标注景别 / 时长 / 画面 / 旁白，共 8 镜；第 5 镜为关键转折（ADH 曲线下降），末镜收束主题「身体的节水阀」
【输出 JSON】{ title, hooks: [8 items], shots: [{ no, scene, duration, visual }] }`;
}

/** 渲染时保留 ${变量} 字面并冷青高亮 */
function highlightVars(p: string): ReactNode[] {
  return p.split(/(\$\{[^}]+\})/g).map((part, i) =>
    part.startsWith("${") && part.endsWith("}") ? (
      <span key={i} className="gl-var">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** 复制时把字面变量替换为本次编译的实际值 */
function materialize(
  p: string,
  r: Recognition | null,
  o: CompileOptions,
  absName: string,
): string {
  return p
    .replace(/\$\{时长\}/g, o.duration)
    .replace(/\$\{受众\}/g, o.audience)
    .replace(/\$\{现象\}/g, r?.phenomenon || "待补充")
    .replace(/\$\{条件\}/g, r?.condition || "待补充")
    .replace(/\$\{抽象层级\}/g, absName);
}

/* ================= 主组件 ================= */

export default function GlassLab() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [stage, setStage] = useState<Stage>(0);
  const [motion, setMotion] = useState<MotionMode>("full");

  const [text, setText] = useState("");
  const [rec, setRec] = useState<Recognition | null>(null);
  const [placeholder, setPlaceholder] = useState("");
  const [focused, setFocused] = useState(false);

  const [opts, setOpts] = useState<CompileOptions>({
    audience: "大众",
    duration: "60s",
    output: "分镜 + 提示词",
  });

  const [compiledQuestion, setCompiledQuestion] = useState(EXAMPLE);
  const [compiledRec, setCompiledRec] = useState<Recognition | null>(null);
  const [compiledOpts, setCompiledOpts] = useState<CompileOptions>(opts);
  /* 真实编译产物。为 null 时结果页回落到内置示例（离线段/调试用） */
  const [compiled, setCompiled] = useState<CompileView | null>(null);
  const [compileErr, setCompileErr] = useState<CompileErr | null>(null);
  /* 请求在飞。转场第三拍会一直等它 —— 那几秒就是"AI 在补因果链" */
  const [pending, setPending] = useState(false);
  /* 拍二已演完、模型还没回：页脚改说「推演中」，别让用户对着空槽干等 */
  const [waiting, setWaiting] = useState(false);
  /* 观众预演：结果页出现后再单独跑（它自己也要一次模型调用），不挡结果页 */
  const [audience, setAudience] = useState<AudienceReport | null>(null);
  const [audPending, setAudPending] = useState(false);
  const [audErr, setAudErr] = useState<string | null>(null);

  const [abstraction, setAbstraction] = useState<Abstraction>(1);
  const [absFade, setAbsFade] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /* 每条因果链的「详略权重」：1 简讲 / 2 正常 / 3 重点展开。
     因果链本身锁死 —— 那是 AI 的判断，不该让用户改；
     用户真正该调的是「这一环讲多少」，那才影响成片。 */
  const [weights, setWeights] = useState<Record<string, number>>({});
  /* 拖动过程挂在 window 上，闭包里的 drag 会过期，所以另存一份 ref */
  const dragRef = useRef<DragState | null>(null);
  const [activeShot, setActiveShot] = useState(4);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const deskRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const deskRect = useRef<DOMRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const shotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timers = useRef<number[]>([]);
  /* 编译编排用：phase / 产物都放进 ref，因为异步回调和定时器
     读不到最新 state（闭包会过期）。 */
  const phaseRef = useRef<Phase>("landing");
  const compiledRef = useRef<CompileView | null>(null);
  const startAtRef = useRef(0);
  const advancedRef = useRef(false);
  const skipWantedRef = useRef(false);
  const reqIdRef = useRef(0);
  const audIdRef = useRef(0);
  /* 转场用：记下"你的词"在句子里的原始几何，以及编译台槽位的 DOM，
     用来算出 token 的起点位移（否则它只会从槽位正上方落下） */
  const userRects = useRef<{ condition?: DOMRect; phenomenon?: DOMRect }>({});
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);

  /* ---------- 动效开关：localStorage + prefers-reduced-motion ---------- */
  /* autoSimple = "因为系统偏好被自动设为简化"。它只做默认值，且必须在界面上
     明确告诉用户、并给一键升级 —— 否则用户看到的是"动效没做"，却不知道
     根因是自己的系统设置（这个默认值一旦写进 localStorage 就会粘死）。 */
  const [autoSimple, setAutoSimple] = useState(false);
  const chooseMotion = (m: MotionMode) => {
    setAutoSimple(false);
    setMotion(m);
  };

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("vizlab-motion-v2");
    } catch { /* 忽略 */ }
    if (stored === "full" || stored === "simple") {
      setMotion(stored);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotion("simple");
      setAutoSimple(true);
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    /* 只持久化"用户明确选过"的状态 */
    if (autoSimple) return;
    try {
      localStorage.setItem("vizlab-motion-v2", motion);
    } catch { /* 忽略 */ }
  }, [motion, autoSimple]);

  /* ---------- 打字机占位轮播（聚焦停止） ---------- */
  useEffect(() => {
    if (focused || phase !== "landing" || motion === "simple") {
      setPlaceholder(EXAMPLE);
      return;
    }
    let idx = 0;
    let pos = 0;
    let timer: number | undefined;
    const step = () => {
      const s = EXAMPLES[idx];
      if (pos < s.length) {
        pos += 1;
        setPlaceholder(s.slice(0, pos));
        timer = window.setTimeout(step, 105);
      } else {
        timer = window.setTimeout(() => {
          pos = 0;
          idx = (idx + 1) % EXAMPLES.length;
          setPlaceholder("");
          timer = window.setTimeout(step, 550);
        }, 1900);
      }
    };
    timer = window.setTimeout(step, 500);
    return () => window.clearTimeout(timer);
  }, [focused, phase, motion]);

  /* ---------- 实时识别（防抖 300ms） ---------- */
  useEffect(() => {
    const t = window.setTimeout(() => setRec(analyze(text)), 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const segments = useMemo(() => (text ? segmentText(text) : null), [text]);

  /* phase 的 ref 镜像：定时器与 fetch 回调里读不到最新的 state */
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* 观众预演：进入结果页之后才发起，避免和编译抢那一次模型调用。
     失败不影响结果页 —— 它只是附加的一次质检。 */
  useEffect(() => {
    if (phase !== "result" || !compiled) return;
    /* 只有「完整方案」才跑观众预演 —— 它要额外一次模型调用（约 2.3s），
       别的产出模式下没必要花这个时间。 */
    if (compiledOpts.output !== "完整方案") return;
    const id = ++audIdRef.current;
    setAudience(null);
    setAudErr(null);
    setAudPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(compiled.raw),
        });
        if (id !== audIdRef.current) return;
        const data = (await res.json()) as {
          ok: boolean;
          report?: AudienceReport;
          message?: string;
        };
        if (!res.ok || !data.ok || !data.report) {
          setAudErr(data.message || "观众预演没能完成。");
        } else {
          setAudience(data.report);
        }
      } catch {
        if (id === audIdRef.current) setAudErr("观众预演服务暂时不可用。");
      } finally {
        if (id === audIdRef.current) setAudPending(false);
      }
    })();
  }, [phase, compiled, compiledOpts.output]);

  /* 核验用：?to=<id> 把指定区块滚进视口（headless 只能拍视口，不滚永远验不到下半页）。
     依赖 compiled 而不是 audience —— 否则只有「完整方案」才滚。 */
  useEffect(() => {
    if (!compiled) return;
    const to = debugParams()?.get("to");
    if (!to) return;
    const t = window.setTimeout(
      () => document.getElementById(to)?.scrollIntoView({ block: "start" }),
      800,
    );
    return () => window.clearTimeout(t);
  }, [compiled]);

  /* 核验用：?drag=<节点序号>&dx=&dy= 冻结一个"正在拖动"的状态；
     ?w=<序号>:<权重>,... 直接套一份详略权重（?drag 不会触发 pointerup）。 */
  useEffect(() => {
    if (!compiled) return;
    const p = debugParams();
    if (!p) return;
    const wq = p.get("w");
    if (wq) {
      const next: Record<string, number> = {};
      wq.split(",").forEach((pair) => {
        const [i, v] = pair.split(":").map((x) => Number(x.trim()));
        const node = compiled.nodes[i];
        if (node && v >= 1 && v <= 3) next[node.id] = v;
      });
      setWeights(next);
    }
    if (p.get("drag") === null) return;
    const n = compiled.nodes[Number(p.get("drag"))];
    if (!n) return;
    setDrag({
      id: n.id,
      dx: Number(p.get("dx") ?? 0),
      dy: Number(p.get("dy") ?? 90),
      active: true,
    });
  }, [compiled]);

  /* 结果页 / 转场的数据源：真实编译产物优先。
     未编译时（首屏）回落到内置示例 —— 首屏本来就不显示这些内容，
     回落只为保证任何中间态都渲染得出来，不会白屏。 */
  const nodes = compiled?.nodes ?? NODES;
  const edges = compiled?.edges ?? EDGES;
  const shots = compiled?.shots ?? SHOTS;
  const chain = compiled?.chain ?? CHAIN;
  const totalSec = compiled?.totalSec ?? 38;
  /* 概念图画布尺寸：真实数据随节点数收紧；内置示例沿用原设计稿尺寸 */
  /* 概念图可布局宽度：随视口变化重算坐标。
     节点是绝对定位的 px，若仍按 1160 排，窄窗口里最右一列会被 overflow 裁掉。 */
  const [avail, setAvail] = useState(GRAPH_W);
  useEffect(() => {
    const upd = () => setAvail(Math.max(560, Math.min(GRAPH_W, window.innerWidth - 88)));
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);
  const lay = useMemo(
    () => layoutOf(compiled ? compiled.nodes.length : 0, avail),
    [compiled, avail],
  );
  const graphNodes = useMemo(
    () =>
      compiled
        ? compiled.nodes.map((n, i) => ({ ...n, x: lay.pos[i].x, y: lay.pos[i].y }))
        : NODES,
    [compiled, lay],
  );
  const graphW = compiled ? lay.w : GRAPH_W;
  const graphH = compiled ? lay.h : GRAPH_H;
  /* 「产出」选项必须真的有区别 —— 之前三个选项渲染完全相同，
     等于骗用户（空控件比没有控件更糟）。
       仅提示词      只有提示词
       分镜 + 提示词  概念图 + 分镜 + 提示词（默认）
       完整方案      再加观众预演与交付规格 */
  const outMode = compiledOpts.output;
  const showGraph = outMode !== "仅提示词";
  const showShots = outMode !== "仅提示词";
  const showAudience = outMode === "完整方案";
  const showSpec = outMode === "完整方案";
  /* 观众预演派生量。shotIndex 是 0-based（后端 Shot.index 口径），显示时 +1 */

  /* 按详略权重重算每镜时长：总时长不变，只是重新分配。
     分镜每镜都带 conceptId，可以精确对回某一环。 */
  const weightedShots = useMemo<Shot[]>(() => {
    if (!shots.length || Object.keys(weights).length === 0) return shots;
    const factor = (id?: string) => (id ? (weights[id] ?? 2) : 2) / 2;
    const raw = shots.map((s) => s.dur * factor(s.conceptId));
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum <= 0) return shots;
    return shots.map((s, i) => ({
      ...s,
      dur: Math.round(((raw[i] * totalSec) / sum) * 10) / 10,
    }));
  }, [shots, weights, totalSec]);

  /* 节点位移场，与 edgePath 内部保持一致：
     被拖的节点走满位移，与它直接相连的节点按阻尼牵引 —— 这样拖动时
     是"整条因果链被拎起来"，而不是一个方块孤零零地滑出去。 */
  const nodeOffset = useCallback(
    (id: string) => {
      if (!drag?.active) return { x: 0, y: 0 };
      if (id === drag.id) {
        /* 与 edgePath 里的封顶保持一致，否则线和方块会脱开 */
        return {
          x: Math.max(-DRAG_VIS_X, Math.min(DRAG_VIS_X, drag.dx * 0.4)),
          y: Math.max(-DRAG_VIS_Y, Math.min(DRAG_VIS_Y, drag.dy)),
        };
      }
      const linked = edges.some(
        (e) => (e.from === drag.id && e.to === id) || (e.to === drag.id && e.from === id),
      );
      return linked ? { x: drag.dx * DRAG_DAMP, y: drag.dy * DRAG_DAMP } : { x: 0, y: 0 };
    },
    [drag, edges],
  );

  /* 核验用：?dbg=1 把概念图的实测几何打印到页面上。
     截图缩放后读不出小字，只能让页面自己报数。 */
  const [dbgTxt, setDbgTxt] = useState("");
  useEffect(() => {
    const p = debugParams();
    if (!p || p.get("dbg") !== "1") return;
    const t = window.setTimeout(() => {
      const box = document.querySelector(".gl-graph");
      const r = box?.getBoundingClientRect();
      const first = document.querySelector(".gl-node");
      const fr = first?.getBoundingClientRect();
      const cs = first ? window.getComputedStyle(first) : null;
      setDbgTxt(
        `dbg · vp ${window.innerWidth} · mq960=${window.matchMedia("(max-width: 960px)").matches}` +
          ` · graph ${Math.round(r?.width ?? 0)}x${Math.round(r?.height ?? 0)}` +
          ` · node1 pos=${cs?.position} left=${cs?.left} top=${cs?.top}` +
          ` · nodeBox ${Math.round(fr?.width ?? 0)}x${Math.round(fr?.height ?? 0)}` +
          ` · vars ${graphW}x${graphH} · n=${nodes.length}`,
      );
    }, 400);
    return () => window.clearTimeout(t);
  }, [compiled, graphW, graphH, nodes.length]);

  /* 拖动方向 = 详略，三档吸附：
       向上 ≥50px   → 重点展开（3）
       向下 ≥50px   → 简讲（1）
       中间 18~50px → 均分（2）
     |dy| ≤18px 视为没动，保持原样。
     关键是中间那档 —— 否则一旦设成重点/简讲，就再也拖不回去了。 */
  const weightOf = (id: string) => weights[id] ?? 2;
  const snapWeight = (dy: number): number | null => {
    if (Math.abs(dy) <= 18) return null;
    if (dy <= -50) return 3;
    if (dy >= 50) return 1;
    return 2;
  };
  const pendingWeight = (id: string) => {
    if (!drag?.active || drag.id !== id) return weightOf(id);
    return snapWeight(drag.dy) ?? weightOf(id);
  };

  /* 松手处理放进 ref：window 监听的闭包否则会读到过期的 weights */
  const dragUpRef = useRef<() => void>(() => {});
  useEffect(() => {
    dragUpRef.current = () => {
      const cur = dragRef.current;
      dragStart.current = null;
      if (cur) {
        const next = snapWeight(cur.dy);
        if (next !== null && next !== weightOf(cur.id)) {
          setWeights((w) => {
            const copy = { ...w };
            /* 回到均分就把这条记录删掉，保持"只有偏离默认的才记录"的语义 */
            if (next === 2) delete copy[cur.id];
            else copy[cur.id] = next;
            return copy;
          });
        }
      }
      dragRef.current = null;
      setDrag((d) => (d ? { ...d, dx: 0, dy: 0, active: false } : null));
    };
  });

  const audAvg =
    audience && audience.probes.length
      ? Math.round(audience.probes.reduce((s, p) => s + p.comprehension, 0) / audience.probes.length)
      : null;
  const audWeak = audience
    ? [...audience.probes]
        .filter((p) => p.comprehension < 70)
        .sort((a, b) => a.comprehension - b.comprehension)
        .slice(0, 3)
    : [];

  /* ---------- 编译：真实请求 + 转场编排 ---------- */

  /**
   * compile(text, options) —— 真调后端。
   * 未收录的问题后端会走模型生成；模型失败 / 未配置模型时返回 422，
   * 这里如实呈现，绝不拿一段 mock 顶着。
   */
  const tryAdvance = useCallback(() => {
    if (advancedRef.current) return;
    if (phaseRef.current !== "compiling") return;
    if (!compiledRef.current) return; // 数据还没到，继续等
    if (Date.now() < startAtRef.current + 1400) return; // 拍二还没演完
    advancedRef.current = true;
    if (skipWantedRef.current) {
      phaseRef.current = "result";
      setPhase("result");
      return;
    }
    setStage(3); // 补链
    timers.current.push(window.setTimeout(() => setStage(4), 800)); // 落定
    timers.current.push(
      window.setTimeout(() => {
        phaseRef.current = "result";
        setPhase("result");
      }, 1220),
    );
  }, []);

  const runCompile = useCallback(
    async (question: string, o: CompileOptions) => {
      const id = ++reqIdRef.current;
      const sec = Number(o.duration.replace(/[^0-9]/g, "")) || 60;
      const bail = (code: string, message: string, suggestions: string[] = []) => {
        setPending(false);
        setCompileErr({ ok: false, code, message, suggestions });
        timers.current.forEach((t) => window.clearTimeout(t));
        timers.current = [];
        phaseRef.current = "error";
        setPhase("error");
      };
      try {
        if (DEBUG_SLOW > 0) await new Promise((r) => window.setTimeout(r, DEBUG_SLOW));
        const res = await fetch(DEBUG_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, durationTargetSec: sec }),
        });
        if (id !== reqIdRef.current) return; // 已被后一次编译取代
        const data = (await res.json()) as CompileResponse;
        if (!res.ok || !data.ok) {
          const err = data as CompileErr;
          bail(err.code || "MODEL_FAILED", err.message || "这条问题暂时编译不了。", err.suggestions);
          return;
        }
        const view = adaptCompile(data);
        compiledRef.current = view;
        setCompiled(view);
        setPending(false);
        setWaiting(false);
        tryAdvance();
      } catch {
        if (id !== reqIdRef.current) return;
        bail("NETWORK", "编译服务暂时不可用，请确认本地服务在运行后重试。");
      }
    },
    [tryAdvance],
  );

  const startCompile = useCallback(
    (q: string, o: CompileOptions) => {
      const question = q.trim();
      if (!question) return;
      deskRect.current = deskRef.current?.getBoundingClientRect() ?? null;
      /* 在输入框还没变形之前，把两个词的原位置量下来 */
      const grabMark = (cat: string) =>
        mirrorRef.current?.querySelector<HTMLElement>(`.gl-mark--${cat}`)?.getBoundingClientRect() ??
        undefined;
      userRects.current = { condition: grabMark("cond"), phenomenon: grabMark("phen") };
      setCompiledQuestion(question);
      /* 就地识别，不依赖防抖 300ms 后的 rec state ——
         否则用户打完字立刻按编译时 compiledRec 还是 null，
         转场里"你的词"就整个不见了。 */
      setCompiledRec(analyze(question));
      setCompiledOpts(o);
      setCompiled(null);
      setCompileErr(null);
      compiledRef.current = null;
      advancedRef.current = false;
      skipWantedRef.current = false;
      startAtRef.current = Date.now();
      setPending(true);
      setWaiting(false);
      phaseRef.current = "compiling";
      setPhase("compiling");
      setStage(1);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [
        window.setTimeout(() => setStage(2), 400), // 定睛 400ms
        /* 硬性约束：每拍的动画必须能在自己的窗口内跑完。
           第三拍不在这里定时 —— 它由请求决定何时开始（见 tryAdvance）。 */
        window.setTimeout(() => {
          // 拍二演完了模型还没回：如实说"在推演"，而不是假装已经补完
          if (!compiledRef.current) setWaiting(true);
          tryAdvance();
        }, 1400),
      ];
      void runCompile(question, o);
    },
    [runCompile, tryAdvance],
  );

  /* 跳过：只用来「跳过动画」，不是用来「跳过等待」。
     有结果才允许跳 —— 没有结果时跳过去，结果页只能回落到写死的示例，
     等于把用户的提问换成另一个问题的答案（这就是「先看结果」直接导向
     「为什么天一冷就想尿尿」的原因）。所以这里严格空操作。 */
  const skipCompile = useCallback(() => {
    if (!compiledRef.current) return;
    skipWantedRef.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    phaseRef.current = "result";
    setPhase("result");
  }, []);

  useEffect(() => {
    if (phase !== "compiling") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipCompile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, skipCompile]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* 调试钩子（只用于核验，不影响正常使用）：
       ?freeze=1..4  把转场冻结在第 N 拍 —— 核验单拍布局
       ?auto=1       用示例问题跑一次**真实编排**（走 startCompile 的定时器逐拍切类）
       ?t=MS         把动画推进到 MS 毫秒后暂停 —— 配 freeze 看中间帧
     有了这三个，headless --virtual-time-budget 才能真正按时间轴取样，
     验证"动画是否真的在跑"，而不只是看静止的端点。 */
  useEffect(() => {
    /* 下面每一个参数都会改变页面行为（自动编译示例、替换接口、冻结动画……），
       所以统一要求 ?debug=1。没有这一层，一条带 ?auto=1 的旧链接就能让人
       以为「这网站只会回答天一冷想尿尿」。 */
    const p = debugParams();
    if (!p) return;
    /* ?motion=full|simple 强制指定动效模式 —— 必须能在核验时绕开
       localStorage 与系统偏好，否则 headless（默认报告 reduce）永远验的是简化模式。 */
    const forceMotion = p.get("motion");
    if (forceMotion === "full" || forceMotion === "simple") {
      setAutoSimple(false);
      setMotion(forceMotion);
    }
    const n = Number(p.get("freeze"));
    const auto = p.get("auto") === "1";
    DEBUG_SLOW = Number(p.get("slow") || 0) || 0;
    DEBUG_API = p.get("api") || "/api/compile";
    if (!auto && (!n || n < 1 || n > 4)) return;
    deskRect.current = deskRef.current?.getBoundingClientRect() ?? null;
    if (auto) {
      /* 先把句子落到 text，等 mirror 层真的渲染出语义标记再触发编译 ——
         否则测不到几何，token 只能用回退位移（这是脚手架问题，不是产品代码问题）。
         ?q=... 可指定问题，用来核验"不同问题得到不同结果"。
         ?output= / ?dur= 覆盖产出与时长选项（headless 里点选项条很麻烦）。 */
      const q = p.get("q") || EXAMPLE;
      const o = { ...opts };
      if (p.get("output")) o.output = p.get("output") as string;
      if (p.get("dur")) o.duration = p.get("dur") as string;
      setText(q);
      window.setTimeout(() => startCompile(q, o), 80);
    } else {
      setText(EXAMPLE);
      setCompiledQuestion(EXAMPLE);
      setCompiledRec(analyze(EXAMPLE));
      setPhase("compiling");
      setStage(n as Stage);
    }
    const t = Number(p.get("t") || 0);
    if (t > 0) {
      requestAnimationFrame(() => {
        document.getAnimations().forEach((a) => {
          try {
            a.currentTime = t;
            a.pause();
          } catch {
            /* 少数动画不可暂停，忽略 */
          }
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 转场：把 token 的起点定在句子里的原位 ----------
     不测真实几何的话，token 只会从目标槽位正上方落下，
     右端那个词就会凭空出现在画面另一侧，"从我的话里被拎出来"随即穿帮。 */
  useLayoutEffect(() => {
    if (phase !== "compiling" || stage < 2) return;
    chain.forEach((c, i) => {
      if (!c.from) return;
      const chip = chipRefs.current[i];
      const src = userRects.current[c.from];
      if (!chip || !src) return;
      const cr = chip.getBoundingClientRect();
      chip.style.setProperty("--fx", `${src.left + src.width / 2 - (cr.left + cr.width / 2)}px`);
      chip.style.setProperty("--fy", `${src.top + src.height / 2 - (cr.top + cr.height / 2)}px`);
    });
  }, [phase, stage, chain]);

  /* ---------- FLIP：输入台缩至顶部 ---------- */
  useLayoutEffect(() => {
    if (phase !== "result" || !barRef.current) return;
    const bar = barRef.current;
    const from = deskRect.current;
    if (!from || motion === "simple") return;
    const to = bar.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = Math.max(from.width / to.width, 0.3);
    bar.style.transition = "none";
    bar.style.transform = `translate(${dx}px, ${dy}px) scale(${sx})`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = "transform 700ms var(--ease)";
        bar.style.transform = "";
      });
    });
  }, [phase, motion]);

  /* ---------- 交互处理 ---------- */
  /* 抽象档是 radiogroup，必须支持方向键 + roving tabindex。
     原先 3 个按钮各自是独立 tab stop 且无法用方向键切换 ——
     既费步数，也不符合 radiogroup 的既定键盘范式。 */
  const absRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const onAbsKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + ABS.length) % ABS.length;
    switchAbs(next as Abstraction);
    absRefs.current[next]?.focus();
  };

  /* 鼠标跟随高光：rAF 合并事件 + 每帧最多读一次布局。
     之前每个 mousemove 都 getBoundingClientRect() + setProperty，
     等于每次事件强制布局并重绘 ::after；120Hz 鼠标下每秒上百次。
     注意：直接改 --mx/--my 会命中该元素的样式重算，不要放进 transition。 */
  const spot = useRef({ px: 0, py: 0, raf: 0 });
  const onDeskMove = (e: React.MouseEvent) => {
    spot.current.px = e.clientX;
    spot.current.py = e.clientY;
    if (spot.current.raf) return;
    spot.current.raf = window.requestAnimationFrame(() => {
      spot.current.raf = 0;
      const node = deskRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${spot.current.px - r.left}px`);
      node.style.setProperty("--my", `${spot.current.py - r.top}px`);
    });
  };

  const onInputScroll = () => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.style.transform = `translateX(${-inputRef.current.scrollLeft}px)`;
    }
  };

  const switchAbs = (n: Abstraction) => {
    if (n === abstraction) return;
    if (motion === "simple") {
      setAbstraction(n);
      return;
    }
    setAbsFade(true);
    window.setTimeout(() => {
      setAbstraction(n);
      setAbsFade(false);
    }, 220);
  };

  /* hover 上/下游集合 */
  const hoverSet = useMemo(() => {
    if (!hover) return null;
    const up = new Set<string>();
    const down = new Set<string>();
    const qu = [hover];
    while (qu.length) {
      const c = qu.pop()!;
      for (const e of edges) {
        if (e.to === c && !up.has(e.from) && e.from !== hover) {
          up.add(e.from);
          qu.push(e.from);
        }
      }
    }
    const qd = [hover];
    while (qd.length) {
      const c = qd.pop()!;
      for (const e of edges) {
        if (e.from === c && !down.has(e.to) && e.to !== hover) {
          down.add(e.to);
          qd.push(e.to);
        }
      }
    }
    return { up, down };
  }, [hover, edges]);

  const nodeDim = (id: string) =>
    hoverSet !== null && !(hoverSet.up.has(id) || hoverSet.down.has(id) || id === hover);

  const edgeDim = (e: GEdge) => {
    if (!hoverSet || !hover) return false;
    const fromOn =
      hoverSet.up.has(e.from) || hoverSet.down.has(e.from) || e.from === hover;
    const toOn = hoverSet.up.has(e.to) || hoverSet.down.has(e.to) || e.to === hover;
    return !(fromOn && toOn);
  };

  /* 拖拽回弹 */
  /* 门槛原先卡在 1241px（跟结果页 max-width 同值），
     在 1280 窗口 + 浏览器缩放、或小屏笔电上就直接拖不动了。
     改成与移动端断点一致 —— 只要概念图还是绝对定位布局就允许拖。 */
  const canDrag = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 961px)").matches;

  const onNodeDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (!canDrag()) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    const start: DragState = { id, dx: 0, dy: 0, active: true };
    dragRef.current = start;
    setDrag(start);
  };

  /* 拖动过程挂在 window 上监听：只靠节点自身的 pointermove，
     指针一离开节点就会中断（捕获在部分浏览器/缩放下也不可靠），
     表现出来就是"拖拽没反应"。 */
  useEffect(() => {
    if (!drag?.active) return;
    const move = (e: PointerEvent) => {
      const s = dragStart.current;
      const cur = dragRef.current;
      if (!s || !cur) return;
      const next = { ...cur, dx: e.clientX - s.x, dy: e.clientY - s.y };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => dragUpRef.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag?.active]);

  /* 分镜 / 时间轴双向联动 */
  const selectShot = (i: number, fromTimeline = false) => {
    setActiveShot(i);
    if (fromTimeline) {
      shotRefs.current[i]?.scrollIntoView({
        behavior: motion === "full" ? "smooth" : "auto",
        block: "nearest",
      });
    }
  };

  /* 复制（剪贴板三级回退） */
  const copyPrompt = async () => {
    const out = materialize(buildTemplate(compiledQuestion), compiledRec, compiledOpts, ABS[abstraction].name);
    let ok = false;
    try {
      await navigator.clipboard.writeText(out);
      ok = true;
    } catch { /* 回退 */ }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = out;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } else {
      // 最终回退：选中代码文本，提示手动复制
      const sel = window.getSelection();
      if (sel && codeRef.current) {
        sel.removeAllRanges();
        sel.selectAllChildren(codeRef.current);
      }
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 2400);
    }
  };

  const backToEdit = () => {
    setPhase("landing");
    setStage(0);
  };

  /* ---------- 渲染数据 ---------- */
  const stageClass =
    phase === "compiling" ? (["", "is-scan", "is-split", "is-recombine", "is-unfold"][stage] ?? "") : "";
  /* 拍二演完、模型还没回时，第三拍的名字改说「推演」——
     那正是 AI 在做的事：补全你没说出口的因果环节。 */
  const stageNames = [
    "",
    "定睛 · 定位概念",
    "拆解 · 剥离提问",
    waiting ? "推演 · AI 正在补全因果链" : "补链 · 填补因果",
    "落定",
  ];
  /* 等待时说「还差几环」，不说百分比。
     百分比是编的（我们并不知道模型要跑多久），环数是真的 ——
     它就是那几个空槽的数量，和画面上看到的完全对得上。 */
  const pendingRings = chain.filter((c) => !c.from).length;
  /* 拍二演完、模型还没回时，说的应该是「在推演」，
     而不是停在「拆解」让用户以为卡住了。 */
  const beatLabel = waiting && stage <= 2 ? stageNames[3] : stageNames[stage];
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
  /* 有真实编译产物就用它生成的模板 —— 否则提示词里的「核心机制」会一直是
     写死的那条链，跟用户问的问题完全没关系。 */
  const template = useMemo(() => {
    const base = compiled?.prompt ?? buildTemplate(compiledQuestion);
    const tuned = Object.entries(weights).filter(([, v]) => v !== 2);
    if (!tuned.length) return base;
    /* 因果链一个字不改，只把「这一环讲多少」写进提示词 ——
       否则前端调了权重、交给下游的还是均分，等于白调。 */
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nameOf = (id: string) => byId.get(id)?.labels[1];
    const heavy = tuned.filter(([, v]) => v === 3).map(([id]) => nameOf(id)).filter(Boolean);
    const light = tuned.filter(([, v]) => v === 1).map(([id]) => nameOf(id)).filter(Boolean);
    const line = [
      heavy.length ? `重点展开：${heavy.join("、")}` : "",
      light.length ? `简讲：${light.join("、")}` : "",
    ]
      .filter(Boolean)
      .join("；");
    return base.replace(/(【输出 JSON】)/, `【详略】${line}\n$1`);
  }, [compiled, compiledQuestion, weights, nodes]);
  /* 识别不到条件/现象时的兜底两段（见 splitSentence） */
  const [fbA, fbB] = useMemo(() => splitSentence(compiledQuestion), [compiledQuestion]);

  /* ============================================================ */

  return (
    <>
      {/* 背景层 */}
      <div className="bg-layer" aria-hidden="true">
        <div className="aurora">
          <span className="aurora__blob aurora__blob--cyan" />
          <span className="aurora__blob aurora__blob--blue" />
          <span className="aurora__blob aurora__blob--violet" />
        </div>
        <div className="noise" />
      </div>

      {phase === "error" ? (
        /* ================= 失败态 =================
           产品底线是"宁可说没收录，也不硬编"。这里如实说明 + 给出可点的建议，
           绝不用一段无关的 mock 顶上去。 */
        <div className="gl-landing">
          <header className="gl-nav">
            <div className="gl-brand">
              <span className="gl-brand__mark">VIZLAB</span>
              <span className="gl-brand__sub">提示词编译台 · PROMPT COMPILER</span>
            </div>
          </header>
          <section className="gl-error">
            <div className="glass gl-error__card">
              <span className="gl-error__tag">
                {compileErr?.code === "NOT_COVERED"
                  ? "NOT COVERED"
                  : compileErr?.code === "NETWORK"
                    ? "OFFLINE"
                    : "MODEL FAILED"}
              </span>
              <h2>
                {compileErr?.code === "NOT_COVERED"
                  ? "这条问题暂未收录"
                  : compileErr?.code === "NETWORK"
                    ? "连不上编译服务"
                    : "模型没能完成这次编译"}
              </h2>
              <p className="gl-error__msg">
                {compileErr?.message ?? "这次编译没有成功。"}
                {compileErr?.code === "NOT_COVERED" &&
                  "　　我们不编造答案 —— 与其给你一段和问题无关的方案，不如直说。"}
              </p>
              {!!compileErr?.suggestions?.length && (
                <>
                  <p className="gl-error__hint">换一个试试：</p>
                  <div className="gl-error__sug">
                    {compileErr.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="glass gl-chip"
                        onClick={() => {
                          setText(s);
                          setCompileErr(null);
                          phaseRef.current = "landing";
                          setPhase("landing");
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                className="gl-compile gl-error__back"
                onClick={() => {
                  setCompileErr(null);
                  phaseRef.current = "landing";
                  setPhase("landing");
                }}
              >
                重新提问
              </button>
            </div>
          </section>
        </div>
      ) : phase === "result" && compiled ? (
        /* ================= 结果页 =================
           必须同时有真实编译产物才渲染。结果页的数据源是 `compiled?.x ?? 示例`，
           少了这道判断，任何「没数据却进了结果态」的路径都会把示例当答案端出来。 */
        <div className="gl-result-wrap">
          <header className="gl-nav">
            <div className="gl-brand">
              <span className="gl-brand__mark">VIZLAB</span>
              <span className="gl-brand__sub">提示词编译台 · PROMPT COMPILER</span>
            </div>
            {/* 右侧三项收进同一个容器：原先它们直接挂在 .gl-nav 下，
                再加一项就挤成四段；收成一个弹性组后，窄屏才能整组换行。 */}
            <div className="gl-nav__side">
              <div className="gl-pill glass">目标模型：Opus 5.5</div>
              <div className="gl-motion" role="group" aria-label="动效强度">
                <button className={motion === "full" ? "on" : ""} aria-pressed={motion === "full"} onClick={() => chooseMotion("full")}>
                  <span className="gl-motion__prefix">动效：</span>完整
                </button>
                <button className={motion === "simple" ? "on" : ""} aria-pressed={motion === "simple"} onClick={() => chooseMotion("simple")}>
                  简化
                </button>
              </div>
              {autoSimple && motion === "simple" && (
                <button type="button" className="gl-motion-hint" onClick={() => chooseMotion("full")}>
                  已按系统偏好简化 · 点此开启完整动效
                </button>
              )}
            </div>
          </header>

          {/* FLIP 目标：输入台缩至顶部 */}
          <div ref={barRef} className="glass gl-topbar">
            {/* 返回入口原先是一句淡青小字「已编译 · 可再次编辑」，几乎看不见。
                改成带箭头的明确按钮 —— 用户看完结果的第一件事往往就是再问一个。 */}
            <button type="button" className="gl-back" onClick={backToEdit}>
              <svg className="gl-back__icon" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M10 3.5 5.5 8 10 12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              重新提问
            </button>
            <span className="gl-topbar__text">{compiledQuestion}</span>
            <span className="gl-topbar__mode">
              {compiledOpts.output} · {compiledOpts.duration}
            </span>
          </div>

          <main className="gl-result">
            {/* 概念图 */}
            <section className={`reveal${showGraph ? "" : " is-hidden"}`} style={d(60)}>
              <div className="gl-section-head">
                <div>
                  <h2>
                    概念图 · <b>因果链</b>
                  </h2>
                  {/* 拖动 = 调这一环讲多少（因果链锁死，不改 AI 的判断） */}
                  {drag?.active ? (
                    <p className="gl-sub">
                      松手设为{" "}
                      <b className="gl-acc">
                        {["简讲", "正常", "重点展开"][pendingWeight(drag.id) - 1]}
                      </b>{" "}
                      · 分镜时长会重新分配
                    </p>
                  ) : (
                    <p className="gl-sub">
                      {nodes.length} 步机制 · 上下拖动节点调「讲多少」
                      {Object.keys(weights).length > 0 && (
                        <button type="button" className="gl-reset" onClick={() => setWeights({})}>
                          恢复均分
                        </button>
                      )}
                    </p>
                  )}
                </div>
                <div className="gl-abs" role="radiogroup" aria-label="抽象程度">
                  <span
                    className="gl-abs__thumb"
                    style={{ left: `calc(${abstraction} * (100% - 8px) / 3 + 4px)` }}
                  />
                  {ABS.map((a, i) => (
                    <button
                      key={a.name}
                      role="radio"
                      aria-checked={abstraction === i}
                      tabIndex={abstraction === i ? 0 : -1}
                      ref={(el) => {
                        absRefs.current[i] = el;
                      }}
                      onKeyDown={(e) => onAbsKey(e, i)}
                      onClick={() => switchAbs(i as Abstraction)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              {dbgTxt && (
                <p className="gl-sub" style={{ color: "var(--amber)", marginBottom: 10 }}>
                  {dbgTxt}
                </p>
              )}
              <div
                className={`glass gl-graph${absFade ? " is-fading" : ""}`}
                /* 用 CSS 变量而非内联 width/height：媒体查询里的
                   「移动端占满宽度」规则才覆盖得掉 */
                style={{ ["--gw" as string]: `${graphW}px`, ["--gh" as string]: `${graphH}px` }}
              >
                <svg
                  className="gl-graph__svg"
                  viewBox={`0 0 ${graphW} ${graphH}`}
                  aria-hidden="true"
                >
                  {edges.map((e, i) => {
                    /* 与拖动节点直接相连的边：实时重算路径 + 提亮，
                       拖动时"链"是连着的，不是方块脱开 */
                    const live = !!drag?.active && (e.from === drag.id || e.to === drag.id);
                    const dpath = edgePath(e, graphNodes, drag);
                    const dim = edgeDim(e);
                    return (
                      <g key={`${e.from}-${e.to}`} className={dim && !live ? "dim" : ""}>
                        <path
                          d={dpath}
                          pathLength={1}
                          className={`gl-edge${e.dashed ? " gl-edge--dashed" : ""}${e.amber ? " gl-edge--amber" : ""}${live ? " is-live" : ""}`}
                          style={d(i * 90)}
                        />
                        {motion === "full" && !e.dashed && !dim && (
                          <circle r="3" className="gl-dot">
                            <animateMotion dur="3s" repeatCount="indefinite" path={dpath} />
                          </circle>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {graphNodes.map((n, i) => {
                  /* 上下游关系：原先只有 hover 才可见，读屏与键盘用户永远拿不到。
                     改成 <button> + aria-describedby 后，聚焦即可获得同样的信息。 */
                  const ups = edges
                    .filter((e) => e.to === n.id)
                    .map((e) => nodes.find((x) => x.id === e.from)?.labels[abstraction])
                    .filter(Boolean) as string[];
                  const downs = edges
                    .filter((e) => e.from === n.id)
                    .map((e) => nodes.find((x) => x.id === e.to)?.labels[abstraction])
                    .filter(Boolean) as string[];
                  const desc = [
                    ups.length ? `上游：${ups.join("、")}` : "",
                    downs.length ? `下游：${downs.join("、")}` : "",
                  ]
                    .filter(Boolean)
                    .join("；");
                  return (
                    <button
                      type="button"
                      key={n.id}
                      className={[
                        "gl-node",
                        n.start ? "gl-node--start" : "",
                        n.terminal ? "gl-node--terminal" : "",
                        n.missing ? "gl-node--missing" : "",
                        n.bypass ? "gl-node--bypass" : "",
                        pendingWeight(n.id) !== 2 ? `gl-node--w${pendingWeight(n.id)}` : "",
                        drag?.id === n.id && drag.active ? "dragging" : "",
                        n.id === hover ? "hover" : "",
                        nodeDim(n.id) ? "dim" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={(() => {
                        const off = nodeOffset(n.id);
                        const lifted = !!drag?.active && drag.id === n.id;
                        const moving = off.x !== 0 || off.y !== 0;
                        return {
                          left: n.x,
                          top: n.y,
                          width: n.bypass ? 160 : NODE_W,
                          transform: moving
                            ? `translate(${off.x}px, ${off.y}px)${lifted ? " scale(1.04)" : ""}`
                            : undefined,
                          zIndex: lifted ? 6 : undefined,
                        };
                      })()}
                      onPointerDown={(e) => onNodeDown(e, n.id)}
                      onPointerEnter={() => !n.bypass && setHover(n.id)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => !n.bypass && setHover(n.id)}
                      onBlur={() => setHover(null)}
                      aria-label={`${n.bypass ? "旁路" : `概念 ${i + 1}`}：${n.labels[abstraction]}`}
                      aria-describedby={desc ? `nd-${n.id}` : undefined}
                    >
                      <span className="gl-node__idx">{n.bypass ? "BYPASS" : String(i + 1).padStart(2, "0")}</span>
                      <span className="gl-node__label">{n.labels[abstraction]}</span>
                      {pendingWeight(n.id) !== 2 && (
                        <span className="gl-node__w">
                          {pendingWeight(n.id) === 3 ? "重点" : "简讲"}
                        </span>
                      )}
                      {desc && (
                        <span id={`nd-${n.id}`} className="sr-only">
                          {desc}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="gl-sub" style={{ textAlign: "center", marginTop: 14 }}>
                {ABS[abstraction].hint}
              </p>
            </section>

            {/* 分镜 + 时间轴 */}
            <section
              className={`reveal${showShots ? "" : " is-hidden"}`}
              id="shots"
              style={d(120)}
            >
              <div className="gl-section-head">
                <div>
                  <h2>
                    分镜 · <b>{shots.length} 镜</b> · {totalSec}s
                  </h2>
                  <p className="gl-sub">
                    胶片卡与时间轴双向联动 · 第 {Math.floor(shots.length / 2) + 1} 镜为关键转折
                    {Object.keys(weights).length > 0 && (
                      <span className="gl-acc"> · 已按因果链详略重排时长</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="gl-shots">
                {weightedShots.map((s, i) => {
                  const w = weights[s.conceptId ?? ""] ?? 2;
                  return (
                    <button
                      key={s.no}
                      ref={(el) => {
                        shotRefs.current[i] = el;
                      }}
                      className={`glass gl-shot${activeShot === i ? ` on${s.tone === "amber" ? " amber" : ""}` : ""}${
                        w === 3 ? " is-key" : w === 1 ? " is-light" : ""
                      }`}
                      aria-pressed={activeShot === i}
                      onClick={() => selectShot(i)}
                    >
                      <span className="gl-shot__thumb" data-tone={s.tone ?? "base"}>
                        {w !== 2 && (
                          <i className="gl-shot__w">{w === 3 ? "重点" : "简讲"}</i>
                        )}
                      </span>
                      <span className="gl-shot__meta">
                        {s.no} · {s.type} · {s.dur}s
                      </span>
                      <span className="gl-shot__text">{s.text}</span>
                    </button>
                  );
                })}
              </div>
              <div className="gl-timeline" role="group" aria-label="分镜时间轴">
                {weightedShots.map((s, i) => {
                  const w = weights[s.conceptId ?? ""] ?? 2;
                  return (
                    <button
                      key={s.no}
                      className={`gl-tl-seg${activeShot === i ? " on" : ""}${s.tone === "amber" ? " amber" : ""}${
                        w === 3 ? " key" : w === 1 ? " light" : ""
                      }`}
                      style={{ flexGrow: s.dur }}
                      onClick={() => selectShot(i, true)}
                      aria-label={`第 ${s.no} 镜 · ${s.type} · ${s.dur} 秒${w === 3 ? " · 重点展开" : w === 1 ? " · 简讲" : ""}`}
                      title={`${s.no} · ${s.type} · ${s.dur}s`}
                    />
                  );
                })}
              </div>
            </section>

            {/* 观众预演 · 理解度曲线（仅「完整方案」） */}
            <section
              className={`reveal${showAudience ? "" : " is-hidden"}`}
              id="audience"
              style={d(150)}
            >
              <div className="gl-section-head">
                <div>
                  <h2>
                    观众预演 · <b>理解度曲线</b>
                  </h2>
                  <p className="gl-sub">按目标观众走一遍分镜 · 标出最容易掉队的那一镜</p>
                </div>
                {audAvg !== null && (
                  <div className="gl-aud-stat">
                    <span>
                      平均 <b>{audAvg}</b>
                    </span>
                    <span>
                      收束 <b>{audience?.endingComprehension}</b>
                    </span>
                  </div>
                )}
              </div>

              <div className="glass gl-aud">
                {audPending ? (
                  <p className="gl-aud__msg">正在按目标观众预演每一镜…</p>
                ) : audErr ? (
                  <p className="gl-aud__msg">{audErr}</p>
                ) : audience && audience.probes.length > 0 ? (
                  <>
                    <svg
                      className="gl-aud__chart"
                      viewBox={`0 0 ${CH_W} ${CH_H}`}
                      role="img"
                      aria-label={`各镜理解度：${audience.probes
                        .map((p, i) => `第${i + 1}镜 ${p.comprehension}`)
                        .join("，")}`}
                    >
                      {[25, 50, 75].map((v) => {
                        const y = CH_PY + (1 - v / 100) * (CH_H - CH_PY * 2);
                        return (
                          <line
                            key={v}
                            className="gl-aud__grid"
                            x1={CH_PX}
                            x2={CH_W - CH_PX}
                            y1={y}
                            y2={y}
                          />
                        );
                      })}
                      {(() => {
                        const pts = chartPoints(audience.probes);
                        const line = pts.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" ");
                        const base = CH_H - CH_PY;
                        return (
                          <>
                            <path
                              className="gl-aud__area"
                              d={`${line} L ${pts[pts.length - 1].x} ${base} L ${pts[0].x} ${base} Z`}
                            />
                            <path className="gl-aud__line" d={line} pathLength={1} />
                            {pts.map((q) => {
                              const worst = q.probe.shotIndex === audience.worstShot;
                              return (
                                <g key={q.i}>
                                  <circle
                                    className={`gl-aud__dot${worst ? " is-worst" : ""}`}
                                    cx={q.x}
                                    cy={q.y}
                                    r={worst ? 5 : 3.2}
                                  />
                                  <text
                                    className={`gl-aud__val${worst ? " is-worst" : ""}`}
                                    x={q.x}
                                    y={q.y - 12}
                                  >
                                    {q.probe.comprehension}
                                  </text>
                                  <text className="gl-aud__idx" x={q.x} y={CH_H - 6}>
                                    {String(q.i + 1).padStart(2, "0")}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>

                    {(audWeak.length > 0 || audience.notes.length > 0) && (
                      <div className="gl-aud__notes">
                        {audWeak.map((p) => (
                          <div key={`w${p.shotIndex}`} className="gl-aud__note">
                            <span className="gl-aud__note-head">
                              第 {p.shotIndex + 1} 镜 · {p.conceptName} · 理解度 {p.comprehension}
                            </span>
                            <span className="gl-aud__note-body">{p.stuck || p.patch || "这一镜容易掉队"}</span>
                          </div>
                        ))}
                        {audience.notes.slice(0, 2).map((n) => (
                          <div key={n.id} className="gl-aud__note is-structural">
                            <span className="gl-aud__note-head">
                              第 {n.shotIndex + 1} 镜 · {n.title}
                            </span>
                            <span className="gl-aud__note-body">{n.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : audience ? (
                  <>
                    <p className="gl-aud__msg">
                      这次只跑到确定性检查（未启用观众模型）。以下是从分镜结构直接推出来的提示：
                    </p>
                    <div className="gl-aud__notes">
                      {audience.notes.slice(0, 4).map((n) => (
                        <div key={n.id} className="gl-aud__note is-structural">
                          <span className="gl-aud__note-head">
                            第 {n.shotIndex + 1} 镜 · {n.title}
                          </span>
                          <span className="gl-aud__note-body">{n.detail}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            {/* 可执行提示词 */}
            <section className="reveal" style={d(180)}>
              <div className="gl-section-head">
                <div>
                  <h2>
                    可执行提示词 · <b>整段复制即用</b>
                  </h2>
                  <p className="gl-sub">
                    变量以冷青高亮 · 复制时自动替换为本次编译的实际值
                    {compiled && totalSec !== Number(compiledOpts.duration.replace(/[^0-9]/g, "")) && (
                      <>
                        {" "}
                        · 目标 {compiledOpts.duration}，受旁白语速约束实际收在 <b>{totalSec}s</b>
                      </>
                    )}
                  </p>
                </div>
                {showSpec && compiled?.spec && (
                  <div className="gl-spec">
                    <span>
                      <b>{compiled.spec.aspect}</b> 画幅
                    </span>
                    <span>
                      <b>{compiled.spec.resolution}</b>
                    </span>
                    <span>
                      <b>{compiled.spec.fps}</b> fps
                    </span>
                    <span>
                      <b>{totalSec}</b> s 总时长
                    </span>
                    {compiled.auditScore != null && (
                      <span>
                        一致性 <b>{compiled.auditScore}</b>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="gl-codeblock">
                <div className="gl-code__bar">
                  <span className="gl-code__file">prompt · vizlab · 科普 · {compiledOpts.duration}.txt</span>
                  <button
                    className={`gl-copy${copied ? " done" : ""}`}
                    onClick={() => void copyPrompt()}
                    aria-live="polite"
                  >
                    {copied ? (
                      <svg viewBox="0 0 24 24" className="gl-tick" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                    {copied ? "已复制" : copyFailed ? "已选中文本，请 Ctrl+C" : "复制"}
                  </button>
                </div>
                <pre className="gl-code" ref={codeRef} tabIndex={0}>
                  {highlightVars(template)}
                </pre>
                <p className="gl-code__foot">更详一句再编译 · analyze(text) / compile(text, options) 预留接口</p>
              </div>
            </section>
          </main>
        </div>
      ) : (
        /* ================= 首页 / 编译转场 ================= */
        <div className="gl-landing">
          <header className="gl-nav">
            <div className="gl-brand">
              <span className="gl-brand__mark">VIZLAB</span>
              <span className="gl-brand__sub">提示词编译台 · PROMPT COMPILER</span>
            </div>
            <div className="gl-nav__side">
              <div className="gl-pill glass">目标模型：Opus 5.5</div>
              <div className="gl-motion" role="group" aria-label="动效强度">
                <button className={motion === "full" ? "on" : ""} aria-pressed={motion === "full"} onClick={() => chooseMotion("full")}>
                  <span className="gl-motion__prefix">动效：</span>完整
                </button>
                <button className={motion === "simple" ? "on" : ""} aria-pressed={motion === "simple"} onClick={() => chooseMotion("simple")}>
                  简化
                </button>
              </div>
              {autoSimple && motion === "simple" && (
                <button type="button" className="gl-motion-hint" onClick={() => chooseMotion("full")}>
                  已按系统偏好简化 · 点此开启完整动效
                </button>
              )}
            </div>
          </header>

          <section className="gl-hero">
            <h1>
              把一句好奇，<em>编译</em>成一支<span className="gl-nb">科普视频</span>
            </h1>
            <p className="gl-hero__sub">抽象概念结构 × 可执行提示词 · 输入一句“条件 + 现象”式的疑问试试</p>
          </section>

          <div
            className={`gl-desk-zone${stageClass ? ` ${stageClass}` : ""}`}
            aria-busy={pending}
          >
            {/* 输入台 + 其正下方的编译台（共用一层定位上下文） */}
            <div className="gl-desk-wrap">
            {/* 玻璃输入台 */}
            <div
              ref={deskRef}
              className="glass glass--spot gl-desk"
              onMouseMove={onDeskMove}
            >
              <div className="gl-desk__main">
              <div className="gl-field">
                <input
                  ref={inputRef}
                  className="gl-input"
                  type="text"
                  value={text}
                  placeholder={placeholder}
                  aria-label="输入你的科普问题"
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onScroll={onInputScroll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      startCompile(text, opts);
                    }
                  }}
                />
                {/* mirror 层：彩色结构下划线 */}
                <div ref={mirrorRef} className="gl-mirror" aria-hidden="true">
                  {segments?.map((s, i) =>
                    s.mark ? (
                      <span key={i} className={`gl-mark gl-mark--${s.mark}`}>
                        {s.text}
                      </span>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                </div>
              </div>
              <button
                className="gl-compile"
                onClick={() => startCompile(text, opts)}
                disabled={phase === "compiling" || !text.trim()}
              >
                {phase === "compiling" ? "编译中" : "编译"}
                <span>Enter ↵</span>
              </button>
              </div>
              {/* 实时识别：并入输入台内部，成为这块玻璃的第二行 */}
              <div className="gl-rec" aria-live="polite">
                {rec ? (
                  <>
                    <span className="gl-rec__tag">已识别</span>
                    {rec.questionType && <span className="gl-chip gl-chip--qt">{rec.questionType} · 问题类型</span>}
                    {rec.condition && <span className="gl-chip gl-chip--cond">{rec.condition} · 条件</span>}
                    {rec.phenomenon && <span className="gl-chip gl-chip--phen">{rec.phenomenon} · 现象</span>}
                  </>
                ) : (
                  <span className="gl-rec__hint">
                    实时识别：编译器会标出这句话里的 条件 / 现象 / 问题类型
                  </span>
                )}
              </div>
            </div>

            {/* 编译转场 · 编译四拍：主角是"你那句话"本身 */}
            {phase === "compiling" && (
              <div
                className="gl-trans"
                /* 槽数是变量（真实概念链可能是 3~5 环），列模板按槽数生成 */
                style={{
                  gridTemplateColumns: Array.from({ length: chain.length })
                    .map(() => "1fr")
                    .join(" 24px ") || "1fr",
                }}
              >
                {chain.flatMap((c, i) => {
                  const node = nodes.find((n) => n.id === c.id)!;
                  const userWord =
                    c.from === "condition"
                      ? compiledRec?.condition || fbA
                      : c.from === "phenomenon"
                        ? compiledRec?.phenomenon || fbB
                        : undefined;
                  const chip = (
                    <div
                      key={`c${i}`}
                      ref={(el) => {
                        chipRefs.current[i] = el;
                      }}
                      className={`gl-tchip gl-tchip--${c.kind}`}
                      style={{ ["--wi" as string]: i } as CSSProperties}
                      aria-hidden="true"
                    >
                      {userWord && <span className="gl-tchip__user">{userWord}</span>}
                      {/* 概念名只在「真的有编译结果」时才渲染。
                          用 waiting 不够：拍二（拆解）开始的那 1 秒里 waiting 还是 false、
                          数据也没到，此时 node.labels 仍在读回退示例，于是
                          「气温下降 / 抗利尿激素分泌减少」会先淡入 —— 那就是把别的
                          问题的答案放进了用户的编译台。有了数据才出现，语义上也更准：
                          你的词先落进去，AI 的结论后到。 */}
                      {compiled && <span className="gl-tchip__node">{node.labels[1]}</span>}
                      {/* 等待模型返回：空着的那几格自己呼吸。
                          那几秒 AI 在补的就是这几环，信号长在它该在的地方，
                          而不是页脚上一根来回走的假进度条。 */}
                      {waiting && !userWord && (
                        <span className="gl-tchip__wait">
                          <i />
                        </span>
                      )}
                    </div>
                  );
                  return i < chain.length - 1
                    ? [
                        chip,
                        <span
                          key={`e${i}`}
                          className={`gl-tedge gl-tedge--${i + 1}`}
                          aria-hidden="true"
                        />,
                      ]
                    : [chip];
                })}
                <div className="gl-trans__foot">
                  {/* 等待时只说一句真话：还差几环。没有进度条、没有百分比。 */}
                  <span className="gl-trans__beat">
                    {waiting
                      ? pendingRings > 0
                        ? `AI 正在补全中间 ${pendingRings} 环`
                        : "AI 正在推演因果链"
                      : beatLabel}
                  </span>
                  {/* 等待期不出现「跳过」类按钮：那一刻还没有结果可看，
                      点它只会把人送到一张还没生成的图上（曾经直接落到示例）。 */}
                  {!waiting && (
                    <button type="button" className="gl-trans__skip" onClick={skipCompile}>
                      跳过 <kbd>Esc</kbd>
                    </button>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* 阶段说明 */}
            {/* 读屏通道：只说「现在在做什么」，一句话。
                原先这里还挂着两样只对手册用户有害的东西：
                ① `0{stage} / 03` —— 零填充编号，stage 走到 4 时会变成自相矛盾的
                   「04 / 03」，而且随拍次反复播报；
                ② `ANALYZE · COMPILE · DELIVER` —— 大写宽字距的氛围字，
                   视觉上从不可见，读屏用户却会在进首页时先听到一句英文。
                两者都不是信息，是装饰漏进了无障碍通道。 */}
            <div className="gl-stage" aria-live="polite">
              {phase === "compiling" ? <span>{beatLabel}</span> : null}
            </div>


            {/* 选项条 */}
            <div className="gl-opts" role="group" aria-label="编译选项">
              {GROUPS.map((g) => (
                <div key={g.key} className="gl-opt-group">
                  <span className="gl-opt-label">{g.label}</span>
                  <div className="gl-opt-caps">
                    {g.options.map((o) => (
                      <button
                        key={o}
                        className={`gl-cap${opts[g.key] === o ? " on" : ""}`}
                        aria-pressed={opts[g.key] === o}
                        onClick={() => setOpts({ ...opts, [g.key]: o })}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 背景漂浮示例卡 */}
          <div className="gl-floats">
            {FLOATS.map((f, i) => (
              <button
                key={i}
                className="glass gl-float-card"
                style={{ left: `${f.x}%`, top: `${f.y}%`, ["--r" as string]: `${f.r}deg`, ["--d" as string]: `${f.d}s` } as CSSProperties}
                onClick={() => {
                  setText(f.t);
                  inputRef.current?.focus();
                }}
              >
                {f.t}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
