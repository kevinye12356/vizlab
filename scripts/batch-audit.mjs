/**
 * 批量审计：把一批真实问法灌进流水线，看有没有错配、翻车、胡说。
 *
 * 用法：
 *   node scripts/batch-audit.mjs                     # 读 batch-questions.txt
 *   node scripts/batch-audit.mjs my-questions.txt
 *
 * 产出：
 *   scripts/out/batch-report.md   完整明细，供人工核对内容准确性
 *   终端                           一张速览表，用来快速定位问题行
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HERE = dirname(fileURLToPath(import.meta.url));

const file = process.argv[2] ?? join(HERE, "batch-questions.txt");
const questions = readFileSync(file, "utf8")
  .split("\n")
  .map((x) => x.trim())
  .filter(Boolean);



function connectivity(graph) {
  const ids = graph.nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  graph.edges.forEach((e) => {
    if (!out.has(e.from) || !indeg.has(e.to)) return;
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  });
  const seen = new Set();
  const stack = ids.filter((id) => indeg.get(id) === 0);
  while (stack.length) {
    const u = stack.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    out.get(u).forEach((v) => {
      if (!seen.has(v)) stack.push(v);
    });
  }
  return { connected: seen.size === ids.length, reachable: seen.size, total: ids.length };
}

function lint(graph, storyboard) {
  const issues = [];
  const ids = new Set(graph.nodes.map((n) => n.id));

  graph.edges.forEach((e) => {
    if (!ids.has(e.from) || !ids.has(e.to)) issues.push(`边引用不存在节点 ${e.from}→${e.to}`);
  });
  graph.nodes.forEach((n) => {
    if (n.name.length > 12) issues.push(`概念名过长：${n.name}`);
    if (n.narration.length > 42) issues.push(`旁白超字数：${n.name}(${n.narration.length})`);
    if (!n.mechanism) issues.push(`缺机制：${n.name}`);
  });
  if (graph.thesis.length > 44) issues.push(`论点过长(${graph.thesis.length})`);

  const c = connectivity(graph);
  if (!c.connected) issues.push(`图不连通 ${c.reachable}/${c.total}`);
  if (graph.nodes.length < 4) issues.push(`概念过少(${graph.nodes.length})`);
  if (graph.edges.length < graph.nodes.length - 1) issues.push(`边过少`);

  return { issues, conn: c };
}

const rows = [];
const details = [];

for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  process.stdout.write(`\r跑第 ${i + 1}/${questions.length} 题…            `);

  let d;
  try {
    const r = await fetch(`${BASE}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, styleId: "diagram" }),
    });
    d = await r.json();
  } catch (err) {
    rows.push({ i: i + 1, q, status: "网络失败", flag: "✕" });
    continue;
  }

  if (!d.ok) {
    rows.push({ i: i + 1, q, status: `${d.code} ${d.message.slice(0, 20)}`, flag: "✕" });
    details.push(`## ${i + 1}. ${q}\n\n编译失败：${d.code} ${d.message}\n`);
    continue;
  }

  const { issues, conn } = lint(d.graph, d.storyboard);
  const bad = d.audit.findings.filter((f) => f.level !== "pass");
  const isSeed = d.engine === "seed";

  let flag = "OK";
  if (issues.length) flag = "硬伤";
  else if (bad.some((f) => f.level === "fail")) flag = "检查不通过";
  else if (bad.length) flag = "提醒";
  else if (!conn.connected) flag = "断链";
  if (isSeed && d.graph.confidence < 0.8) flag = "弱命中";

  rows.push({
    i: i + 1,
    q,
    flag,
    engine: isSeed ? `种子 ${d.graph.confidence}` : `模型 ${d.graph.confidence}`,
    nodes: d.graph.nodes.length,
    edges: d.graph.edges.length,
    score: d.audit.score,
    ms: d.elapsedMs,
    chain: d.graph.nodes.map((n) => n.name),
    seed: d.graph.seedId ?? "",
    matched: (d.graph.matchedTerms ?? []).join("/"),
    issues,
    bad: bad.map((f) => `${f.id}:${f.detail}`),
  });

  details.push(
    [
      `## ${i + 1}. ${q}`,
      "",
      `- 引擎：${isSeed ? `种子库 ${d.graph.seedId}（${d.graph.confidence}）` : `模型 ${d.model ?? ""}（${d.graph.confidence}）`} · ${d.elapsedMs}ms`,
      `- 命中词：${(d.graph.matchedTerms ?? []).join("、") || "—"}`,
      `- 论点：${d.graph.thesis}`,
      d.graph.hedge ? `- 限定：${d.graph.hedge}` : "- 限定：（无）",
      `- 概念链：${d.graph.nodes.map((n) => n.name).join(" → ")}`,
      `- 因果边 ${d.graph.edges.length} 条 · 连通 ${conn.connected ? "是" : `否 ${conn.reachable}/${conn.total}`}`,
      `- 检查：${d.audit.score} 分 ${bad.map((f) => f.id).join(" ") || "全通过"}`,
      issues.length ? `- 硬伤：${issues.join("；")}` : "- 硬伤：无",
      "",
      "| 镜 | 概念 | 旁白 |",
      "| --- | --- | --- |",
      ...d.storyboard.shots.map(
        (s) => `| ${s.index + 1} | ${s.conceptName} | ${s.narration.replace(/\|/g, "｜")} |`,
      ),
      "",
    ].join("\n"),
  );
}

mkdirSync(join(HERE, "out"), { recursive: true });
writeFileSync(
  join(HERE, "out", "batch-report.md"),
  `# 批量审计报告\n\n共 ${questions.length} 题\n\n${details.join("\n---\n\n")}`,
  "utf8",
);

console.log("\n");
const ok = rows.filter((r) => r.engine);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("#", 4) + pad("标记", 12) + pad("引擎", 14) + pad("分", 5) + pad("概念", 5) + "题目");
console.log("-".repeat(100));
rows.forEach((r) => {
  console.log(
    pad(r.i, 4) +
      pad(r.flag ?? "—", 12) +
      pad(r.engine ?? r.status ?? "—", 14) +
      pad(r.score ?? "—", 5) +
      pad(r.nodes ?? "—", 5) +
      r.q,
  );
});

const problems = rows.filter((r) => r.flag && r.flag !== "OK");
console.log("\n" + "=".repeat(100));
console.log(`成功 ${ok.length}/${rows.length} · 有问题 ${problems.length} 题`);
if (ok.length) {
  console.log(
    `平均检查分 ${(ok.reduce((a, r) => a + r.score, 0) / ok.length).toFixed(1)} · ` +
      `平均耗时 ${Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length)}ms · ` +
      `模型路径 ${ok.filter((r) => r.engine.startsWith("模型")).length} 题 / 种子路径 ${ok.filter((r) => r.engine.startsWith("种子")).length} 题`,
  );
}
console.log("明细已写入 scripts/out/batch-report.md");
console.log("=".repeat(100));
