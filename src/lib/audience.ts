import type {
  AudienceProbe,
  AudienceReport,
  ConceptGraph,
  Storyboard,
  StructuralNote,
} from "./types";

/**
 * 观众模拟
 * ------------------------------------------------------------------
 * 前面 7 条检查规则问的是「这条片子对不对」，
 * 这里问的是「这条片子能不能被听懂」——层级更高一层。
 *
 * 刻意拆成两个来源，并且分开展示：
 *  1. 确定性通道：纯算法找出「提前引用」——某个概念还没轮到它解释就被提到了。
 *     这是硬证据，零模型调用，跑两次结果一致。
 *  2. 模型通道：扮演一个普通观众，估计逐镜理解度并给出处方。
 *     这是估计，不是测量，UI 上必须标明来源。
 *
 * 不把两者混成一个分数，是因为一旦混了，评委追问"这个百分比怎么来的"就答不上来。
 */

const ENDPOINT =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
const COUNT_RE =
  /([一二三四五六七八九十两]|\d+)\s*(个|种|套|条|步|层|类|方面|阶段|机制|原因|因素|环节)/g;
const CONCEPT_UNITS = new Set([
  "个", "种", "套", "条", "层", "类", "方面", "阶段", "机制", "原因", "因素", "环节",
]);

/**
 * 确定性通道：三条纯算法检查，零模型调用，跑两次结果一致。
 *
 * 之所以要有一条不依赖模型的通道，是因为模型会变、会飘，
 * 而"旁白说三个、图里有六个"这种事，算得出来就该算出来。
 */
export function findStructuralNotes(
  graph: ConceptGraph,
  storyboard: Storyboard,
): StructuralNote[] {
  const notes: StructuralNote[] = [];

  const explainAt = new Map<string, number>();
  for (const shot of storyboard.shots) {
    if (!explainAt.has(shot.conceptId)) explainAt.set(shot.conceptId, shot.index);
  }

  // N1 提前引用
  for (const shot of storyboard.shots) {
    // 开场钩子与收尾本来就是"先抛结论再解释"，在那里点出概念不算提前引用
    if (shot.conceptId === "__hook__" || shot.conceptId === "__close__") continue;

    for (const node of graph.nodes) {
      const mentioned =
        shot.narration.includes(node.name) || shot.onScreen.includes(node.name);
      if (!mentioned) continue;
      const at = explainAt.get(node.id);
      if (at === undefined || shot.index >= at) continue;

      notes.push({
        id: `prereq-${shot.index}-${node.id}`,
        shotIndex: shot.index,
        kind: "prereq",
        title: `提前用到了「${node.name}」`,
        detail: `旁白在这一镜就提到了「${node.name}」，但它要到第 ${at + 1} 镜才解释。观众此刻只能靠猜。`,
        patch: `把「${node.name}」的解释提前，或者先在这里用一句白话带过。`,
      });
    }
  }

  // N2 数量对不上
  // 同一个说法（例如"三套机制"）在开场和收尾会重复出现，按原文去重，只报第一次
  const seenCounts = new Set<string>();
  for (const shot of storyboard.shots) {
    COUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COUNT_RE.exec(shot.narration)) !== null) {
      const raw = m[1];
      const unit = m[2];
      if (!CONCEPT_UNITS.has(unit)) continue;
      const n = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : CN_NUM[raw];
      if (!Number.isFinite(n) || n < 2) continue;
      if (graph.nodes.length - n < 2) continue;

      // 两道豁免，缺一个"采用处方"就会不收敛：
      // ① 写成「其中三套」时，已经明确说了是子集，不再让观众去数
      const lead = shot.narration.slice(Math.max(0, m.index - 2), m.index);
      if (lead === "其中") continue;

      // ② 同一句里已经点了至少两个概念的名字，说明创作者本来就点过名了
      const namedHere = graph.nodes.filter((x) => shot.narration.includes(x.name)).length;
      if (namedHere >= 2) continue;

      if (seenCounts.has(m[0])) continue;
      seenCounts.add(m[0]);

      notes.push({
        id: `count-${shot.index}-${n}-${unit}`,
        shotIndex: shot.index,
        kind: "count-mismatch",
        title: `数量对不上：说了「${raw}${unit}」，图里有 ${graph.nodes.length} 个概念`,
        detail: `旁白说「${raw}${unit}」，但这条片子里一共出现过 ${graph.nodes.length} 个概念。观众会回头去数，然后对不上。`,
        patch: `改成「其中${n}${unit}」，或者干脆点名，别让观众自己去数。`,
        // 纯文本替换，确定性可执行，不需要模型参与
        rewrite: shot.narration.replace(m[0], `其中${m[0]}`),
      });
    }
  }

  // N3 开场过载
  const hook = storyboard.shots[0];
  if (hook) {
    const named = graph.nodes.filter((n) => hook.narration.includes(n.name));
    if (named.length >= 3) {
      notes.push({
        id: "hook-overload",
        shotIndex: hook.index,
        kind: "hook-overload",
        title: `开场一口气抛出 ${named.length} 个专业术语`,
        detail: `开场那一句里出现了 ${named.map((n) => n.name).join("、")}，可观众一个都还不知道是什么。`,
        patch: "开场只抛一个悬念，术语留到各自的镜头里再出现。",
      });
    }
  }

  return notes;
}

const AUDIENCE_PROMPT = `你是科普短视频的观众模拟器。你的任务不是评价脚本好不好，而是扮演一个普通观众，把它从头到尾听一遍，逐镜报告你的真实理解状态。

只输出一个 JSON 对象，不要解释，不要用 markdown 代码块。

{
  "persona": "一句话描述你扮演的观众，例如：有基本科学常识、但不熟悉行为经济学的普通观众",
  "level": "novice 或 general 或 peer",
  "probes": [
    {
      "shotIndex": 必须与输入的镜号完全一致,
      "comprehension": 0 到 100 的整数，看完这一镜后你累计的理解程度,
      "stuck": "这一镜让你卡在哪里，不超过 40 字；没卡就填空字符串",
      "question": "看完这一镜你产生的疑问，不超过 30 字；没有就填空字符串",
      "missingPrereq": "缺了哪个前置概念才导致卡住，不超过 16 字；没有就填空字符串",
      "patch": "给创作者的一句具体修补建议，不超过 45 字；没有就填空字符串",
      "rewrite": "改写后的旁白原文，不超过 42 字，必须口语化、必须保留原意、必须真的解决你指出的那个问题；没卡点就填空字符串"
    }
  ],
  "endingComprehension": 看完最后一镜的理解程度
}

硬性规则：
1. probes 必须覆盖输入的每一个镜号，数量、顺序完全一致，不得增删或改写镜号。
2. comprehension 是累计值，整体应上升；但当某一镜塞进没铺垫的概念时，允许回落。
3. 必须诚实。多数镜头应该是不卡的。只有当这一镜真的缺了铺垫、或一口气堆了太多新概念时，才写 stuck。
   绝对不要为了显得有用而编造卡点——一份到处是红的报告没有任何价值。
3b. 写了 stuck 就必须给出 rewrite：一句可以直接替换上去的新旁白。
   它要读起来像人话，不能变成补充说明；不能超过 42 字；不能丢掉原来那层意思。
4. 只评价「我听懂了没有」。不要评价画面、配色、镜头、时长、文案优美程度。
5. 你只能听见旁白，看不见画面。因此任何靠画面才能传达的信息，对你来说等于不存在。
6. level 的推断依据是主题本身的专业门槛，不是你懂不懂；你要扮演的是对大多数人而言的合理画像。`;

interface RawProbe {
  shotIndex?: unknown;
  comprehension?: unknown;
  stuck?: unknown;
  question?: unknown;
  missingPrereq?: unknown;
  patch?: unknown;
  rewrite?: unknown;
}

function clampText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

function clampScore(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 模型通道。失败时返回 null，由调用方退化为纯确定性报告——
 * 少了估计可以接受，少了「提前引用」这份硬证据不行。
 */
async function simulate(
  graph: ConceptGraph,
  storyboard: Storyboard,
): Promise<{ persona: string; level: string; probes: AudienceProbe[]; ending: number; model: string } | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const script = storyboard.shots
    .map((s) => `[${s.index}] 概念：${s.conceptName}｜旁白：${s.narration}`)
    .join("\n");

  const userContent = `主题：${graph.question}
一句话论点：${graph.thesis}

逐镜脚本（共 ${storyboard.shots.length} 镜，总时长 ${storyboard.totalSec} 秒）：
${script}

请按规则扮演观众并输出 JSON。镜号必须使用方括号中的数字。`;

  let raw = "";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AUDIENCE_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    raw = json.choices?.[0]?.message?.content ?? "";
  } catch {
    return null;
  }

  let parsed: { persona?: unknown; level?: unknown; probes?: unknown; endingComprehension?: unknown };
  try {
    const text = raw.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "");
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const byIndex = new Map<number, RawProbe>();
  if (Array.isArray(parsed.probes)) {
    for (const item of parsed.probes as RawProbe[]) {
      const idx = Number.parseInt(String(item?.shotIndex ?? ""), 10);
      if (Number.isFinite(idx)) byIndex.set(idx, item);
    }
  }

  // 以真实分镜为准重建，模型多给的镜号一律丢弃
  let prev = 0;
  const probes: AudienceProbe[] = storyboard.shots.map((shot) => {
    const item = byIndex.get(shot.index);
    const score = clampScore(item?.comprehension, Math.min(100, prev + 10));
    prev = score;
    return {
      shotIndex: shot.index,
      conceptName: shot.conceptName,
      comprehension: score,
      stuck: clampText(item?.stuck, 60),
      question: clampText(item?.question, 40),
      missingPrereq: clampText(item?.missingPrereq, 24),
      patch: clampText(item?.patch, 70),
      rewrite: clampText(item?.rewrite, 42) || undefined,
      evidence: "estimated" as const,
    };
  });

  return {
    persona: clampText(parsed.persona, 80) || "有基本科学常识、但不熟悉该主题的普通观众",
    level: clampText(parsed.level, 12) || "general",
    probes,
    ending: clampScore(parsed.endingComprehension, probes[probes.length - 1]?.comprehension ?? 0),
    model: MODEL,
  };
}

export async function runAudienceSimulation(
  graph: ConceptGraph,
  storyboard: Storyboard,
): Promise<AudienceReport> {
  const notes = findStructuralNotes(graph, storyboard);
  const sim = await simulate(graph, storyboard);

  const probes: AudienceProbe[] =
    sim?.probes ??
    storyboard.shots.map((shot) => ({
      shotIndex: shot.index,
      conceptName: shot.conceptName,
      comprehension: 0,
      stuck: "",
      question: "",
      missingPrereq: "",
      patch: "",
      evidence: "ok" as const,
    }));

  // 两条通道分开走：probes 只装模型判断，notes 只装算法判断。
  // 不合并，是为了让每条结论都能说清来源。
  for (const probe of probes) {
    probe.evidence = probe.stuck ? "estimated" : "ok";
  }

  let worstShot: number | null = null;
  let worstDrop = 0;
  for (let i = 1; i < probes.length; i++) {
    const drop = probes[i - 1].comprehension - probes[i].comprehension;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstShot = probes[i].shotIndex;
    }
  }
  // 模型没测到回落、但算法找到了结构性提示时，用提示的位置兜底
  if (worstShot === null && notes.length > 0) {
    worstShot = notes[0].shotIndex;
    worstDrop = 0;
  }

  return {
    persona: sim?.persona ?? "（未接入模型，仅输出确定性检查结果）",
    level: sim?.level ?? "general",
    probes,
    endingComprehension: sim?.ending ?? 0,
    worstShot,
    worstDrop: Math.round(worstDrop),
    notes,
    mode: sim ? "model" : "deterministic-only",
    model: sim?.model,
    generatedAt: new Date().toISOString(),
  };
}
