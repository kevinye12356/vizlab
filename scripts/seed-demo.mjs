/**
 * 生成两条示例档案，让「作品档案」这一步不是空的。
 * 注意：回执里的来源与偏差是示例数据，正式提交前必须替换成真实成片记录。
 *
 * 用法：node scripts/seed-demo.mjs
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function compile(question, styleId, durationTargetSec) {
  const r = await fetch(`${BASE}/api/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, styleId, durationTargetSec }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error(`${question} 编译失败：${d.message}`);
  return d;
}

async function save(d, withHandoff) {
  const r = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      graph: d.graph,
      styleId: d.storyboard.styleId,
      storyboard: d.storyboard,
      audit: d.audit,
      handoff: withHandoff ? d.handoff : undefined,
    }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`归档失败：${j.message}`);
  return j.project;
}

async function record(id, delivery) {
  const r = await fetch(`${BASE}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delivery, status: "delivered" }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`回执失败：${j.message}`);
  return j.project;
}

const a = await compile("为什么明明赢了还想玩，直到输光", "metaphor", 66);
const pa = await save(a, true);
console.log("已归档（已交接）", pa.id, pa.title);

const b = await compile("为什么抗生素要吃满疗程", "evidentiary", 60);
const pb = await save(b, false);
await record(pb.id, {
  source: "示例数据 · 正式提交前替换为真实成片链接",
  durationSec: 63.4,
  publishedAt: "2026-11-02",
  deviations: [
    { shotIndex: 4, note: "模型自行加了推镜，偏离「固定机位」规格" },
    { shotIndex: 7, note: "结尾多出 1.2 秒空镜，总时长偏长 3.4 秒" },
  ],
  note: "按交接包执行，7 个镜头基本还原，第 4 镜运镜跑偏。",
});
console.log("已归档（已回执）", pb.id, pb.title);
