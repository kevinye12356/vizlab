/**
 * 模型路径评测
 *
 * 目的不是"跑通"，而是量化模型这一层到底行不行：
 * 概念准不准、因果边连不连得上、分镜讲不讲得通、检查报告挂在哪。
 *
 * 用法：
 *   node scripts/eval-model.mjs
 *   node scripts/eval-model.mjs "为什么天是蓝的"
 *
 * 前提：开发服务器已启动，且 .env.local 里配了 DEEPSEEK_API_KEY
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const BATTERY = [
  // —— 影像专业区（概念边界清楚，模型应当表现好）——
  { q: "为什么核磁共振要做那么久", tag: "影像" },
  { q: "为什么 MRI 扫描时会有很吵的敲击声", tag: "影像" },
  { q: "为什么做增强扫描要打造影剂", tag: "影像" },
  { q: "为什么 CT 图像上金属周围会有放射状条纹", tag: "影像" },
  { q: "为什么装了心脏起搏器不能做磁共振", tag: "影像" },
  { q: "为什么 PET 要用带放射性的葡萄糖", tag: "影像" },
  // —— 通用科普区（考察跨域稳定性）——
  { q: "为什么天空是蓝色的", tag: "通用" },
  { q: "为什么咖啡越喝越困", tag: "通用" },
  { q: "为什么跑步到一定距离会撞墙", tag: "通用" },
  // —— 陷阱区（机制本身有争议，看它会不会硬下结论）——
  { q: "为什么手泡水久了会起皱", tag: "争议" },
];

function connectivity(graph) {
  const ids = graph.nodes.map((n) => n.id);
  if (ids.length === 0) return { connected: false, reachable: 0, total: 0 };

  const out = new Map();
  ids.forEach((id) => out.set(id, []));
  graph.edges.forEach((e) => {
    if (out.has(e.from)) out.get(e.from).push(e.to);
  });

  const indeg = new Map();
  ids.forEach((id) => indeg.set(id, 0));
  graph.edges.forEach((e) => {
    if (indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to) + 1);
  });

  const roots = ids.filter((id) => indeg.get(id) === 0);
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const u = stack.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    (out.get(u) ?? []).forEach((v) => {
      if (!seen.has(v)) stack.push(v);
    });
  }
  return { connected: seen.size === ids.length, reachable: seen.size, total: ids.length };
}

function lint(graph) {
  const issues = [];
  const ids = new Set(graph.nodes.map((n) => n.id));

  graph.edges.forEach((e) => {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      issues.push(`边引用不存在的节点 ${e.from}→${e.to}`);
    }
  });

  graph.nodes.forEach((n) => {
    if (n.name.length > 12) issues.push(`概念名过长：${n.name}`);
    if (n.narration.length > 42) issues.push(`旁白超 42 字（${n.narration.length}）：${n.name}`);
    if (n.narration.length < 8) issues.push(`旁白过短（${n.narration.length}）：${n.name}`);
    if (!n.mechanism) issues.push(`缺机制说明：${n.name}`);
  });

  if (graph.thesis.length > 44) {
    issues.push(`论点超 44 字（${graph.thesis.length}）：会成为过长的开场旁白`);
  }

  const c = connectivity(graph);
  if (!c.connected) issues.push(`图不连通：${c.reachable}/${c.total} 可达`);

  if (graph.nodes.length < 4) issues.push(`概念过少（${graph.nodes.length}）`);
  if (graph.edges.length < graph.nodes.length - 1) {
    issues.push(`边过少（${graph.edges.length} 条 / ${graph.nodes.length} 节点）`);
  }

  return issues;
}

async function runOne(q, tag) {
  const t0 = Date.now();
  let d;
  try {
    const r = await fetch(`${BASE}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, styleId: "diagram" }),
    });
    d = await r.json();
  } catch (err) {
    return { q, tag, error: String(err) };
  }

  if (!d.ok) {
    return { q, tag, error: `${d.code ?? ""} ${d.message}`, elapsed: Date.now() - t0 };
  }

  const issues = lint(d.graph);
  const bad = d.audit.findings.filter((f) => f.level !== "pass");

  return {
    q,
    tag,
    engine: d.engine,
    coverage: d.graph.coverage,
    confidence: d.graph.confidence,
    elapsed: Date.now() - t0,
    thesis: d.graph.thesis,
    hedge: d.graph.hedge ?? "",
    nodes: d.graph.nodes.map((n) => n.name),
    edgeCount: d.graph.edges.length,
    conn: connectivity(d.graph),
    issues,
    score: d.audit.score,
    bad: bad.map((f) => `${f.id}${f.level === "fail" ? "✕" : "!"}`),
    shots: d.storyboard.shots.length,
    totalSec: d.storyboard.totalSec,
  };
}

const custom = process.argv.slice(2);
const list = custom.length
  ? custom.map((q) => ({ q, tag: "手动" }))
  : BATTERY;

const results = [];
for (let i = 0; i < list.length; i++) {
  const { q, tag } = list[i];
  process.stdout.write(`\n[${i + 1}/${list.length}] ${tag} · ${q}\n`);
  const r = await runOne(q, tag);
  results.push(r);

  if (r.error) {
    console.log(`  ✕ 失败：${r.error}`);
    continue;
  }
  console.log(`  引擎 ${r.engine} · 置信 ${r.confidence} · ${r.elapsed}ms · ${r.shots}镜/${r.totalSec}s`);
  console.log(`  论点：${r.thesis}`);
  if (r.hedge) console.log(`  限定：${r.hedge}`);
  console.log(`  概念：${r.nodes.join(" → ")}`);
  console.log(`  因果边 ${r.edgeCount} 条 · 连通 ${r.conn.connected ? "是" : `否(${r.conn.reachable}/${r.conn.total})`}`);
  console.log(`  检查：${r.score} 分 ${r.bad.length ? r.bad.join(" ") : "全通过"}`);
  if (r.issues.length) {
    console.log(`  硬伤：`);
    r.issues.forEach((x) => console.log(`    - ${x}`));
  } else {
    console.log(`  硬伤：无`);
  }
}

const ok = results.filter((r) => !r.error);
console.log("\n" + "=".repeat(60));
console.log(`完成 ${ok.length}/${results.length}`);
if (ok.length) {
  const avg = ok.reduce((a, r) => a + r.score, 0) / ok.length;
  const clean = ok.filter((r) => r.issues.length === 0).length;
  const conn = ok.filter((r) => r.conn.connected).length;
  console.log(`平均检查分 ${avg.toFixed(1)}`);
  console.log(`零硬伤 ${clean}/${ok.length}`);
  console.log(`图连通 ${conn}/${ok.length}`);
  console.log(`平均耗时 ${Math.round(ok.reduce((a, r) => a + r.elapsed, 0) / ok.length)}ms`);
}
console.log("=".repeat(60));
