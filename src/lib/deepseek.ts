import type { ConceptEdge, ConceptGraph, ConceptNode, Relation } from "./types";

/**
 * 模型层：DeepSeek 接入。
 *
 * 关键设计：模型只负责「概念抽取」这一个动作，
 * 而且输出必须落进固定 schema。分镜、风格、检查全部由确定性代码完成。
 * 所以模型不在关键路径的"生成"上，它只是把自然语言折叠成结构。
 */

const ENDPOINT =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
/** 结构不合格时升级到这个模型。设成与 MODEL 相同即可关闭升级。 */
const ESCALATION = process.env.DEEPSEEK_MODEL_ESCALATE ?? "deepseek-reasoner";

export function hasModel(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const RELATIONS: Relation[] = ["causes", "enables", "contrasts", "feedback"];

const SYSTEM_PROMPT = `你是知识可视化编辑。你的任务不是写科普文案，而是把一个日常困惑拆成一张可拍摄的概念因果图。

只输出一个 JSON 对象，不要输出任何解释、不要用 markdown 代码块包裹。

结构：
{
  "thesis": "一句话论点，反直觉，不超过 34 字",
  "discipline": "学科归属",
  "hedge": "若该机制在学界仍有争议，写一句限定说明；若无争议，填空字符串",
  "nodes": [
    {
      "id": "英文小写短词，全图唯一",
      "name": "概念名，2~10 字，必须是真实存在的学术概念",
      "discipline": "该概念所属学科",
      "definition": "一句话定义，不超过 34 字",
      "mechanism": "为什么这样，不超过 46 字",
      "misconception": "格式必须是「以为……，其实……」，不超过 40 字",
      "visualHook": "这个概念里什么能被看见，不超过 26 字",
      "narration": "该镜头口播，口语化，不超过 42 字，必须能被念出来",
      "visual": "画面内容，写具体动作与主体，不超过 40 字",
      "onScreen": "屏幕字，3~6 字",
      "sourceQuote": "从用户原话里逐字摘出的 4~12 字片段，必须能在问题里原样找到。每个概念尽量摘不同片段；原句太短时允许多个概念共用同一片段，但不得留空"
    }
  ],
  "edges": [
    { "from": "节点 id", "to": "节点 id", "relation": "causes|enables|contrasts|feedback", "label": "不超过 8 字的因果标签" }
  ]
}

硬性规则，违反任意一条即为不合格：
1. nodes 恰好 5 个或 6 个。
2. edges 不少于 nodes 数量减一，且必须构成连通图：从某个起点出发能到达所有节点。
3. 图必须是一条自起点向终点推进的因果链，不允许出现环。
4. 第一个节点是起因，最后一个节点是代价、后果或反噬。
5. 每个 id 只能出现在一条边的 from 位置之前，不允许自环（from 与 to 相同）。
5b. 每个节点的 sourceQuote 必须是用户原话里的连续片段，必须能逐字找到，不允许改写、不允许自己造句。
    这条是「自然语言 → 概念」的可追溯性依据，编造即视为不合格。
5c. 每个节点的 sourceQuote 都必须非空。尽量让不同概念摘不同片段；
    原句太短时允许多个概念共用同一片段，但不得留空——留空等于这个概念没有出处。
6. 相邻镜头的旁白要能连成一段连贯的口播，不要写成词条解释。
7. 概念必须是学界真实存在的术语。不确定的概念宁可不写，绝不允许编造名词。
8. 不要输出诊断结论、用药方案、剂量建议；不要使用「一定」「必然」「百分百」「彻底根治」这类绝对化表述。
9. 如果该现象的主流解释本身存在学术争议（例如手泡水起皱的机制），thesis 与 mechanism 必须写成「目前认为」「主流解释是」，不得断言单一机制，并在 hedge 字段写明争议点。

10. 【最重要】用户的问题里可能埋着未经验证的说法，例如「某频率恰好能疗伤」「章鱼有九个大脑」「冰滑是因为压力融化」。
    你绝对不允许顺着这个说法构建因果链。必须做到：
    - 若前提本身站不住，thesis 要写成「常被说成……但更可靠的说法是……」，或直接在论点里纠正它；
    - 未经证实的功效性说法（疗伤、治愈、排毒、净化、增强免疫、抗衰老、防癌等）不得出现在 nodes 的 name、mechanism、narration 中；
    - 不得为了容纳一个边缘假说而否定主流解释。若主流认为是 A、边缘假说是 B，只能写「主流认为是 A，B 仍缺乏证据」；
      绝对禁止写成「不是 A，而是 B」——这个句式会让观众记住错误结论。
    - 因果链的节点只能是学界已广泛接受的机制，假说性的「功能」不能作为一个因果环节。

示例（仅示范结构，不要复用其中的内容）：
{
  "thesis": "冬天手机自动关机，不是电池没电，是它先自保了。",
  "discipline": "电化学",
  "hedge": "",
  "nodes": [
    { "id": "activity", "name": "锂离子活性", "discipline": "电化学", "definition": "锂离子在正负极之间迁移的能力。", "mechanism": "温度越低，电解液越黏，离子迁移越困难。", "misconception": "以为电量百分比是真实剩余，其实它由电压估算。", "visualHook": "离子在黏稠液体里越走越慢", "narration": "天一冷，电池里的锂离子就走不动了。", "visual": "发光粒子在逐渐变稠的液体中减速", "onScreen": "走不动" },
    { "id": "resistance", "name": "内阻上升", "discipline": "电化学", "definition": "电池内部对电流的阻碍变大。", "mechanism": "离子迁移变慢，等效内阻随温度下降而升高。", "misconception": "以为内阻是坏电池才有的，其实它一直存在。", "visualHook": "管道内壁逐渐变窄", "narration": "路变窄了，同样多的电就送不出去。", "visual": "管道内壁收窄，光点通过速度明显下降", "onScreen": "路变窄" },
    { "id": "drop", "name": "电压骤降", "discipline": "电路", "definition": "负载下端电压瞬间低于阈值。", "mechanism": "内阻升高后，一旦有大电流需求，压降被放大。", "misconception": "以为关机是电量耗尽，其实电压只是被瞬时拉低。", "visualHook": "一条曲线突然跌破红线", "narration": "一按快门，电压瞬间跌破那条线。", "visual": "平滑下降的电压曲线突然垂直坠落，穿过红色阈值线", "onScreen": "跌破阈值" },
    { "id": "protect", "name": "保护性关机", "discipline": "电池管理", "definition": "系统为防止过放而主动断电。", "mechanism": "电压低于保护阈值时，管理芯片切断输出以保护电芯。", "misconception": "以为放回口袋能开机是电量回来了，其实是温度回升让电压恢复。", "visualHook": "开关被强制拉下", "narration": "它不是没电，它是主动把开关拉了下来。", "visual": "一个物理开关被无形的手拉下，画面随即黑场", "onScreen": "自保" }
  ],
  "edges": [
    { "from": "activity", "to": "resistance", "relation": "causes", "label": "迁移变慢" },
    { "from": "resistance", "to": "drop", "relation": "causes", "label": "压降放大" },
    { "from": "drop", "to": "protect", "relation": "causes", "label": "触发保护" }
  ]
}`;

function clamp(s: unknown, max: number): string {
  const v = typeof s === "string" ? s.trim() : "";
  return v.length > max ? v.slice(0, max) : v;
}

/** 把模型返回的内容规整成可用的图，越界字段一律裁掉 */
export function normalizeGraph(
  raw: unknown,
  question: string,
  fallbackThesis: string,
): ConceptGraph {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const nodes: ConceptNode[] = [];

  rawNodes.slice(0, 6).forEach((item, i) => {
    const x = (item ?? {}) as Record<string, unknown>;
    const name = clamp(x.name, 16);
    if (!name) return;
    nodes.push({
      id: clamp(x.id, 24) || `n${i + 1}`,
      name,
      discipline: clamp(x.discipline, 18) || "综合",
      definition: clamp(x.definition, 60),
      mechanism: clamp(x.mechanism, 80),
      misconception: clamp(x.misconception, 60),
      visualHook: clamp(x.visualHook, 40),
      narration: clamp(x.narration, 42),
      visual: clamp(x.visual, 48),
      onScreen: clamp(x.onScreen, 10) || name.slice(0, 4),
      // 出处必须是原话里逐字存在的片段，找不到就留空——不做模糊匹配，不替模型圆谎
      sourceQuote: (() => {
        const q = clamp(x.sourceQuote, 24);
        return q && question.includes(q) ? q : "";
      })(),
    });
  });

  const ids = new Set(nodes.map((n) => n.id));
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];
  const edges: ConceptEdge[] = [];
  rawEdges.forEach((item) => {
    const x = (item ?? {}) as Record<string, unknown>;
    const from = clamp(x.from, 24);
    const to = clamp(x.to, 24);
    if (!ids.has(from) || !ids.has(to) || from === to) return;
    const rel = RELATIONS.includes(x.relation as Relation)
      ? (x.relation as Relation)
      : "causes";
    edges.push({ from, to, relation: rel, label: clamp(x.label, 16) });
  });

  const hedge = clamp(data.hedge, 60);
  const thesis = clamp(data.thesis, 40) || clamp(fallbackThesis, 40);

  return {
    question,
    thesis,
    hedge: hedge || undefined,
    discipline: clamp(data.discipline, 20) || nodes[0]?.discipline || "综合",
    nodes,
    edges,
    coverage: "generated",
    confidence: 0.62,
    matchedTerms: [],
  };
}

async function callModel(
  question: string,
  temperature: number,
  model: string,
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("MODEL_NOT_CONFIGURED");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `把这个困惑拆成概念因果图：${question}` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`模型调用失败 ${res.status} ${text.slice(0, 160)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "{}";
}

/** 去掉模型偶尔加的 markdown 包裹 */
function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
}

/** 有向图是否含环。因果链一旦成环，分镜就排不出满足所有边的顺序。 */
export function hasCycle(graph: ConceptGraph): boolean {
  const adj = new Map<string, string[]>();
  graph.nodes.forEach((n) => adj.set(n.id, []));
  graph.edges.forEach((e) => {
    if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from)!.push(e.to);
  });

  const color = new Map<string, 0 | 1 | 2>();
  graph.nodes.forEach((n) => color.set(n.id, 0));

  const walk = (u: string): boolean => {
    color.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === 1) return true;
      if (c === 0 && walk(v)) return true;
    }
    color.set(u, 2);
    return false;
  };

  return graph.nodes.some((n) => color.get(n.id) === 0 && walk(n.id));
}

/** 结构验收：概念数、边数、连通性、无环，四项都过才算可用 */
export function isUsableGraph(graph: ConceptGraph): boolean {
  if (graph.nodes.length < 4) return false;
  if (graph.edges.length < graph.nodes.length - 1) return false;
  if (hasCycle(graph)) return false;

  const ids = new Set(graph.nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  ids.forEach((id) => out.set(id, []));
  const indeg = new Map<string, number>();
  ids.forEach((id) => indeg.set(id, 0));

  graph.edges.forEach((e) => {
    if (!ids.has(e.from) || !ids.has(e.to)) return;
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  });

  const seen = new Set<string>();
  const stack = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (stack.length) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    (out.get(u) ?? []).forEach((v) => {
      if (!seen.has(v)) stack.push(v);
    });
  }
  return seen.size === ids.size;
}

export async function generateGraph(
  question: string,
): Promise<{ graph: ConceptGraph; model: string }> {
  let lastError: Error = new Error("模型未返回可用结构");

  // 主模型 → 低温重试 → 升级模型。模型路径必须能自愈。
  const plan: { model: string; temperature: number }[] = [
    { model: MODEL, temperature: 0.3 },
    { model: MODEL, temperature: 0.1 },
  ];
  if (ESCALATION && ESCALATION !== MODEL) {
    plan.push({ model: ESCALATION, temperature: 0.2 });
  }

  // 保留一份"最像样"的结果：全部重试都失败时降级交付，
  // 带环等问题会由检查引擎 R5 标红，而不是静默丢弃。
  let best: { graph: ConceptGraph; model: string } | null = null;

  for (const step of plan) {
    try {
      const content = stripFence(await callModel(question, step.temperature, step.model));
      const parsed = JSON.parse(content);
      const graph = normalizeGraph(parsed, question, question);

      if (isUsableGraph(graph)) return { graph, model: step.model };
      if (!best || graph.nodes.length > best.graph.nodes.length) {
        best = { graph, model: step.model };
      }
      lastError = new Error(
        `结构未通过验收：${graph.nodes.length} 概念 / ${graph.edges.length} 边 / ` +
          `${hasCycle(graph) ? "存在因果环" : "连通或密度不足"}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (best && best.graph.nodes.length >= 3) return best;
  throw lastError;
}
