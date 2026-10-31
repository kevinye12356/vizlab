import { promises as fs } from "node:fs";
import path from "node:path";
import { hasModel } from "./deepseek";

/**
 * 探索首页的纸片问题
 * ------------------------------------------------------------------
 * 首页要铺满一屏"为什么"。这些问题不是手写进代码的（那样会被人说是硬编码），
 * 而是打开首页时让模型生成一批，然后**存到服务端缓存**，之后每次打开都一样。
 *
 * 三层兜底：
 *   1. 有缓存 → 直接用
 *   2. 有模型、没缓存 → 调模型生成一批，然后写入缓存
 *   3. 都没有 → 一小批内置问题。注意：内置的只是"问题"，不是"答案"，
 *      所以它不构成种子库，只是让离线的首页不至于空着。
 */

export interface Question {
  text: string;
  category: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "questions.json");

async function readCache(): Promise<Question[]> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { questions?: Question[] };
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    return [];
  }
}

async function writeCache(questions: Question[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify({ questions }, null, 2), "utf8");
}

const PROMPT = `你是科普选题编辑。生成 22 个以"为什么"开头的日常困惑式问题，给一个科普视频工具的探索首页用。

只输出 JSON：{"questions": ["...", "..."]}，不要任何解释，不要用 markdown 包裹。

硬性要求：
1. 每个问题必须有一条清晰的因果链，能被拆成 4 到 6 个概念。纯描述、纯抒情、没有机制的问题一律不要。
2. 每个问题不超过 18 个字，口吻要日常，像朋友随口问出来的，不要学术腔。
3. 主题要散开：物理、生物、化学、心理、经济、工程、医学影像、日常现象，每个领域最多 3 个。
4. 必须是真问题。主流学界有明确解释的优先，允许 3 到 4 个至今有争议的。
5. 不要名人名言式、不要哲学式（"为什么活着"）、不要无法视觉化的。
6. 不要出现诊断结论、用药方案、医疗建议类。
7. 问题里允许出现"别人/我/我们"这类口语主语。`;

/** 让模型生成一批可探索的问题，只挑"拆得动"的 */
async function generateQuestions(): Promise<Question[]> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return [];

  const res = await fetch(
    process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
        temperature: 0.7,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: "生成 22 个。每个都要能被拆成一条因果链。" },
        ],
      }),
    },
  );
  if (!res.ok) return [];

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = (json.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/```\s*$/, "");

  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
  const seen = new Set<string>();
  const out: Question[] = [];

  for (const item of rawList) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || text.length < 6 || text.length > 20) continue;
    if (!/^为什么|^如果|^怎么/.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, category: "探索" });
    if (out.length >= 22) break;
  }
  return out;
}

/** 离线兜底：只有问题，没有答案。它不构成种子库。 */
const FALLBACK: Question[] = [
  { text: "为什么明明赢了还想玩，直到输光", category: "心理" },
  { text: "为什么抗生素要吃满疗程", category: "医学" },
  { text: "为什么越熬夜越睡不着", category: "生理" },
  { text: "为什么 MRI 扫描时会有很吵的敲击声", category: "影像" },
  { text: "为什么冰是滑的，真的是因为压力融化吗", category: "物理" },
  { text: "为什么猫会发出呼噜声，而且频率恰好能疗伤", category: "生物" },
  { text: "为什么飞机能飞起来，常见解释哪里不准确", category: "工程" },
  { text: "为什么海水是咸的，而雨水不是", category: "地理" },
];

export async function getQuestions(): Promise<{
  questions: Question[];
  source: "cache" | "model" | "offline";
}> {
  const cached = await readCache();
  if (cached.length > 0) return { questions: cached, source: "cache" };

  if (hasModel()) {
    const generated = await generateQuestions();
    if (generated.length >= 10) {
      await writeCache(generated);
      return { questions: generated, source: "model" };
    }
  }

  return { questions: FALLBACK, source: "offline" };
}
