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

/* ================= 类型 ================= */

type MotionMode = "full" | "simple";
type Phase = "landing" | "compiling" | "result";
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

const ABS: Array<{ name: string; hint: string }> = [
  { name: "具体", hint: "孩子也能懂的比喻" },
  { name: "机制", hint: "身体里的因果链条" },
  { name: "原理", hint: "生理学层面的解释" },
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
  from: string;
  to: string;
  vertical?: boolean;
  dashed?: boolean;
  amber?: boolean;
  path?: string;
}

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
const CHAIN: Array<{ id: string; kind: string; from?: "condition" | "phenomenon" }> = [
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

/* ================= 概念图几何 ================= */

function nodeById(id: string): GNode {
  return NODES.find((n) => n.id === id)!;
}

function edgePath(e: GEdge): string {
  if (e.path) return e.path;
  const a = nodeById(e.from);
  const b = nodeById(e.to);
  if (e.vertical) {
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x + NODE_W;
    const y2 = b.y + NODE_H / 2;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 60} ${y2}, ${x2} ${y2}`;
  }
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
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

  const [abstraction, setAbstraction] = useState<Abstraction>(1);
  const [absFade, setAbsFade] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; active: boolean } | null>(null);
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

  /* ---------- 编译转场编排 ---------- */
  const startCompile = useCallback(
    (q: string, o: CompileOptions) => {
      const question = q.trim();
      if (!question) return;
      // compile(text, options) 预留接口：接入后端后此处改为 await fetch("/api/compile")
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
      setPhase("compiling");
      setStage(1);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [
        /* 硬性约束：每拍的动画必须能在自己的窗口内跑完。
           上一版第三拍的连线/凝聚最长需要 1380ms，而窗口只有 800ms，
           被下一拍切断 → 看起来"完全没有动"。改时序时必须同步改动画延迟。 */
        window.setTimeout(() => setStage(2), 400), // 扫描 400ms
        window.setTimeout(() => setStage(3), 1400), // 拆句 1000ms（460px 的可读飞行装不进 600ms）
        window.setTimeout(() => setStage(4), 2200), // 重组 800ms
        window.setTimeout(() => setPhase("result"), 2620), // 落定
      ];
    },
    [],
  );

  /* 转场可跳过：Esc 或点「跳过」直接落到结果页 */
  const skipCompile = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
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
    const p = new URLSearchParams(window.location.search);
    /* ?motion=full|simple 强制指定动效模式 —— 必须能在核验时绕开
       localStorage 与系统偏好，否则 headless（默认报告 reduce）永远验的是简化模式。 */
    const forceMotion = p.get("motion");
    if (forceMotion === "full" || forceMotion === "simple") {
      setAutoSimple(false);
      setMotion(forceMotion);
    }
    const n = Number(p.get("freeze"));
    const auto = p.get("auto") === "1";
    if (!auto && (!n || n < 1 || n > 4)) return;
    deskRect.current = deskRef.current?.getBoundingClientRect() ?? null;
    if (auto) {
      /* 先把句子落到 text，等 mirror 层真的渲染出语义标记再触发编译 ——
         否则测不到几何，token 只能用回退位移（这是脚手架问题，不是产品代码问题）。 */
      setText(EXAMPLE);
      window.setTimeout(() => startCompile(EXAMPLE, opts), 80);
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
    CHAIN.forEach((c, i) => {
      if (!c.from) return;
      const chip = chipRefs.current[i];
      const src = userRects.current[c.from];
      if (!chip || !src) return;
      const cr = chip.getBoundingClientRect();
      chip.style.setProperty("--fx", `${src.left + src.width / 2 - (cr.left + cr.width / 2)}px`);
      chip.style.setProperty("--fy", `${src.top + src.height / 2 - (cr.top + cr.height / 2)}px`);
    });
  }, [phase, stage]);

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
      for (const e of EDGES) {
        if (e.to === c && !up.has(e.from) && e.from !== hover) {
          up.add(e.from);
          qu.push(e.from);
        }
      }
    }
    const qd = [hover];
    while (qd.length) {
      const c = qd.pop()!;
      for (const e of EDGES) {
        if (e.from === c && !down.has(e.to) && e.to !== hover) {
          down.add(e.to);
          qd.push(e.to);
        }
      }
    }
    return { up, down };
  }, [hover]);

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
  const canDrag = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1241px)").matches;

  const onNodeDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (!canDrag()) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, dx: 0, dy: 0, active: true });
  };
  const onNodeMove = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (!dragStart.current || drag?.id !== id || !drag.active) return;
    setDrag({
      id,
      dx: e.clientX - dragStart.current.x,
      dy: e.clientY - dragStart.current.y,
      active: true,
    });
  };
  const onNodeUp = () => {
    dragStart.current = null;
    setDrag((d) => (d ? { ...d, active: false } : null));
  };

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
  const stageNames = ["", "定睛 · 定位概念", "拆解 · 剥离提问", "补链 · 填补因果", "落定"];
  const stageProgress = ["0", "0.15", "0.5", "0.85", "1"][stage] ?? "0";
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
  const template = useMemo(() => buildTemplate(compiledQuestion), [compiledQuestion]);
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

      {phase === "result" ? (
        /* ================= 结果页 ================= */
        <div className="gl-result-wrap">
          <header className="gl-nav">
            <div className="gl-brand">
              <span className="gl-brand__mark">VIZLAB</span>
              <span className="gl-brand__sub">提示词编译台 · PROMPT COMPILER</span>
            </div>
            <div className="gl-pill glass">目标模型：Opus 5.5</div>
            <div className="gl-motion" role="group" aria-label="动效强度">
              <button className={motion === "full" ? "on" : ""} aria-pressed={motion === "full"} onClick={() => chooseMotion("full")}>
                动效：完整
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
          </header>

          {/* FLIP 目标：输入台缩至顶部 */}
          <div ref={barRef} className="glass gl-topbar">
            <span className="gl-topbar__text">{compiledQuestion}</span>
            <button className="gl-edit" onClick={backToEdit}>
              已编译 · 可再次编辑
            </button>
          </div>

          <main className="gl-result">
            {/* 概念图 */}
            <section className="reveal" style={d(60)}>
              <div className="gl-section-head">
                <div>
                  <h2>
                    概念图 · <b>因果链</b>
                  </h2>
                  <p className="gl-sub">从原句抽象出的 8 步机制 · 悬停查看上下游 · 节点可拖拽（松手回弹）</p>
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

              <div className={`glass gl-graph${absFade ? " is-fading" : ""}`}>
                <svg className="gl-graph__svg" viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} aria-hidden="true">
                  {EDGES.map((e, i) => {
                    const dpath = edgePath(e);
                    const dim = edgeDim(e);
                    return (
                      <g key={`${e.from}-${e.to}`} className={dim ? "dim" : ""}>
                        <path
                          d={dpath}
                          className={`gl-edge${e.dashed ? " gl-edge--dashed" : ""}${e.amber ? " gl-edge--amber" : ""}`}
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

                {NODES.map((n, i) => {
                  /* 上下游关系：原先只有 hover 才可见，读屏与键盘用户永远拿不到。
                     改成 <button> + aria-describedby 后，聚焦即可获得同样的信息。 */
                  const ups = EDGES.filter((e) => e.to === n.id)
                    .map((e) => NODES.find((x) => x.id === e.from)?.labels[abstraction])
                    .filter(Boolean) as string[];
                  const downs = EDGES.filter((e) => e.from === n.id)
                    .map((e) => NODES.find((x) => x.id === e.to)?.labels[abstraction])
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
                        drag?.id === n.id && drag.active ? "dragging" : "",
                        n.id === hover ? "hover" : "",
                        nodeDim(n.id) ? "dim" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        left: n.x,
                        top: n.y,
                        width: n.bypass ? 160 : NODE_W,
                        transform:
                          drag?.id === n.id
                            ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.04)`
                            : undefined,
                      }}
                      onPointerDown={(e) => onNodeDown(e, n.id)}
                      onPointerMove={(e) => onNodeMove(e, n.id)}
                      onPointerUp={onNodeUp}
                      onPointerEnter={() => !n.bypass && setHover(n.id)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => !n.bypass && setHover(n.id)}
                      onBlur={() => setHover(null)}
                      aria-label={`${n.bypass ? "旁路" : `概念 ${i + 1}`}：${n.labels[abstraction]}`}
                      aria-describedby={desc ? `nd-${n.id}` : undefined}
                    >
                      <span className="gl-node__idx">{n.bypass ? "BYPASS" : String(i + 1).padStart(2, "0")}</span>
                      <span className="gl-node__label">{n.labels[abstraction]}</span>
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
            <section className="reveal" style={d(120)}>
              <div className="gl-section-head">
                <div>
                  <h2>
                    分镜 · <b>8 镜</b> · 38s
                  </h2>
                  <p className="gl-sub">胶片卡与时间轴双向联动 · 第 5 镜为关键转折</p>
                </div>
              </div>
              <div className="gl-shots">
                {SHOTS.map((s, i) => (
                  <button
                    key={s.no}
                    ref={(el) => {
                      shotRefs.current[i] = el;
                    }}
                    className={`glass gl-shot${activeShot === i ? ` on${s.tone === "amber" ? " amber" : ""}` : ""}`}
                    aria-pressed={activeShot === i}
                    onClick={() => selectShot(i)}
                  >
                    <span className="gl-shot__thumb" data-tone={s.tone ?? "base"} />
                    <span className="gl-shot__meta">
                      {s.no} · {s.type} · {s.dur}s
                    </span>
                    <span className="gl-shot__text">{s.text}</span>
                  </button>
                ))}
              </div>
              <div className="gl-timeline" role="group" aria-label="分镜时间轴">
                {SHOTS.map((s, i) => (
                  <button
                    key={s.no}
                    className={`gl-tl-seg${activeShot === i ? " on" : ""}${s.tone === "amber" ? " amber" : ""}`}
                    style={{ flexGrow: s.dur }}
                    onClick={() => selectShot(i, true)}
                    aria-label={`第 ${s.no} 镜 · ${s.type} · ${s.dur} 秒`}
                    title={`${s.no} · ${s.type} · ${s.dur}s`}
                  />
                ))}
              </div>
            </section>

            {/* 可执行提示词 */}
            <section className="reveal" style={d(180)}>
              <div className="gl-section-head">
                <div>
                  <h2>
                    可执行提示词 · <b>整段复制即用</b>
                  </h2>
                  <p className="gl-sub">变量以冷青高亮 · 复制时自动替换为本次编译的实际值</p>
                </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="gl-pill glass">目标模型：Opus 5.5</div>
              <div className="gl-motion" role="group" aria-label="动效强度">
                <button className={motion === "full" ? "on" : ""} aria-pressed={motion === "full"} onClick={() => chooseMotion("full")}>
                  动效：完整
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
              把一句好奇，<em>编译</em>成一支科普视频
            </h1>
            <p className="gl-hero__sub">抽象概念结构 × 可执行提示词 · 输入一句“条件 + 现象”式的疑问试试</p>
          </section>

          <div className={`gl-desk-zone${stageClass ? ` ${stageClass}` : ""}`}>
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
              <div className="gl-trans">
                {CHAIN.flatMap((c, i) => {
                  const node = NODES.find((n) => n.id === c.id)!;
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
                      aria-hidden="true"
                    >
                      {userWord && <span className="gl-tchip__user">{userWord}</span>}
                      <span className="gl-tchip__node">{node.labels[1]}</span>
                    </div>
                  );
                  return i < CHAIN.length - 1
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
                  <span className="gl-trans__beat">{stageNames[stage]}</span>
                  <span className="gl-trans__bar">
                    <i style={{ ["--p" as string]: stageProgress } as CSSProperties} />
                  </span>
                  <button type="button" className="gl-trans__skip" onClick={skipCompile}>
                    跳过 <kbd>Esc</kbd>
                  </button>
                </div>
              </div>
            )}
            </div>

            {/* 阶段说明 */}
            <div className="gl-stage" aria-live="polite">
              {phase === "compiling" ? (
                <>
                  <span>{stageNames[stage]}</span>
                  <span className="gl-stage__bar">
                    <i style={{ ["--p" as string]: stageProgress } as CSSProperties} />
                  </span>
                  <span style={{ color: "var(--ink-faint)" }}>0{stage} / 03</span>
                </>
              ) : (
                <span style={{ color: "var(--ink-ghost)", letterSpacing: "0.2em", fontSize: 11 }}>
                  ANALYZE · COMPILE · DELIVER
                </span>
              )}
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
