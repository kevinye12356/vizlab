import type { Act, ConceptGraph, Shot, Storyboard } from "./types";
import { getStyle } from "./styles";

/**
 * 分镜推导：从概念图算出叙事骨架。
 *
 * 这是 VIZLAB 与"聊天式生成"的分界线：
 * 镜头的顺序不是模型编的，是对概念图做「深度分层拓扑排序」得到的。
 * 因此只要图不变，分镜就不变——可复现、可验证、可审计。
 */

/** 深度分层拓扑排序：把有向概念图拉成一条可叙述的顺序 */
export function orderConcepts(graph: ConceptGraph): string[] {
  const ids = graph.nodes.map((x) => x.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const edges = graph.edges.filter((e) => idx.has(e.from) && idx.has(e.to));

  // 用 DFS 三色法剔除回边，保证得到 DAG（因果闭环只在视觉上表达，不参与排序）
  const color = new Map<string, 0 | 1 | 2>();
  ids.forEach((id) => color.set(id, 0));
  const kept: typeof edges = [];

  const dfs = (u: string) => {
    color.set(u, 1);
    for (const e of edges) {
      if (e.from !== u) continue;
      const c = color.get(e.to)!;
      if (c === 1) continue;
      kept.push(e);
      if (c === 0) dfs(e.to);
    }
    color.set(u, 2);
  };
  ids.forEach((id) => {
    if (color.get(id) === 0) dfs(id);
  });

  // 最长路径深度
  const indeg = new Map<string, number>();
  ids.forEach((id) => indeg.set(id, 0));
  kept.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1));

  const depth = new Map<string, number>();
  ids.forEach((id) => depth.set(id, 0));

  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const e of kept) {
      if (e.from !== u) continue;
      depth.set(e.to, Math.max(depth.get(e.to)!, depth.get(u)! + 1));
      indeg.set(e.to, (indeg.get(e.to) ?? 0) - 1);
      if ((indeg.get(e.to) ?? 0) === 0) queue.push(e.to);
    }
  }

  return [...ids].sort(
    (a, b) => depth.get(a)! - depth.get(b)! || idx.get(a)! - idx.get(b)!,
  );
}

/**
 * 屏幕字的弹出时点
 *
 * 规则：等旁白念完第一个分句再弹。先让人听到半句话，再给术语——
 * 术语抢在解释之前出现，观众只会记住一个不认识的词。
 * 纯算法，读标点，零模型调用。
 */
function onScreenTime(narration: string, durationSec: number): number {
  const m = narration.match(/[，、。！？；：]/);
  const charsBefore = m ? m.index! + 1 : Math.ceil(narration.length * 0.4);
  const rate = 3.8;
  const t = charsBefore / rate;
  return Math.round(Math.min(Math.max(t, 0.6), Math.max(0.6, durationSec - 1)) * 10) / 10;
}

const BEAT = {
  hook: "开场钩子：先抛出一句反直觉的判断",
  close: "回扣论点：把整条因果链收成一句",
  act1: "建立前提：让观众先接受最基础的那一环",
  act2: "机制推进：一层一层把因果接上",
  act2turn: "机制转折：这里是全片的信息量最高点",
  act3: "代价与后果：把机制落到观众自己身上",
};

function actOf(position: number, total: number): Act {
  const third = total / 3;
  if (position < third) return 1;
  if (position < third * 2) return 2;
  return 3;
}

export interface BuildOptions {
  styleId: string;
  durationTargetSec?: number;
}

/**
 * 把总时长按权重分配到各镜头，并满足单镜上下限。
 * 单纯按比例缩放会让镜头上限失效，所以这里做迭代再分配。
 */
function distribute(
  total: number,
  weights: number[],
  min: number,
  max: number,
): number[] {
  const wsum = weights.reduce((a, b) => a + b, 0);
  let d = weights.map((w) => (total * w) / wsum);

  for (let iter = 0; iter < 10; iter++) {
    d = d.map((x) => Math.min(max, Math.max(min, x)));
    const gap = total - d.reduce((a, b) => a + b, 0);
    if (Math.abs(gap) < 0.05) break;
    const adjustable: number[] = [];
    d.forEach((x, i) => {
      if (gap > 0 && x < max - 0.05) adjustable.push(i);
      if (gap < 0 && x > min + 0.05) adjustable.push(i);
    });
    if (adjustable.length === 0) break;
    const share = gap / adjustable.length;
    adjustable.forEach((i) => {
      d[i] += share;
    });
  }

  d = d.map((x) => Math.round(x * 10) / 10);

  // 取整后可能又越过上下限，用 0.1 为步长微调回来，保证总时长精确且每镜合法
  let guard = 0;
  while (guard++ < 400) {
    const diff = Math.round((total - d.reduce((a, b) => a + b, 0)) * 10) / 10;
    if (Math.abs(diff) < 0.05) break;
    const step = diff > 0 ? 0.1 : -0.1;
    const idx = d.findIndex((x) =>
      diff > 0 ? x + step <= max + 1e-9 : x + step >= min - 1e-9,
    );
    if (idx < 0) break;
    d[idx] = Math.round((d[idx] + step) * 10) / 10;
  }

  return d;
}

export function buildStoryboard(graph: ConceptGraph, opts: BuildOptions): Storyboard {
  const style = getStyle(opts.styleId);
  const target = opts.durationTargetSec ?? 45;
  const order = orderConcepts(graph);
  const byId = new Map(graph.nodes.map((x) => [x.id, x]));

  const totalNodeShots = order.length;
  const shotCount = totalNodeShots + 2;

  // 每镜时长由旁白字数推导，而不是平均分配：
  // 话说得多就该给更多时间，这样全片语速才是一致的。
  const narrations = [
    graph.thesis,
    ...order.map((id) => byId.get(id)!.narration),
    graph.thesis,
  ];
  const weights = narrations.map((t) => Math.max(6, t.length));

  // 单镜上下限：低于 2 秒读不完，高于 9 秒节奏塌陷
  const durs = distribute(target, weights, 2, 9);

  const shots: Shot[] = [];

  // 钩子镜
  shots.push({
    index: 0,
    act: 1,
    beat: BEAT.hook,
    durationSec: durs[0],
    conceptId: "__hook__",
    conceptName: "论点抛出",
    visual: `${style.baseMedium}｜空镜：画面里只有一处反常的细节，观众还说不清哪里不对｜${style.camera}`,
    narration: graph.thesis,
    onScreen: "你以为的",
    onScreenAt: 0,
    camera: style.camera,
    transition: "硬切入场",
  });

  order.forEach((id, i) => {
    const node = byId.get(id)!;
    const position = i;
    const act = actOf(position, totalNodeShots);
    const isTurn = act === 2 && position === Math.floor(totalNodeShots / 2);
    const beat = isTurn ? BEAT.act2turn : act === 1 ? BEAT.act1 : act === 2 ? BEAT.act2 : BEAT.act3;

    shots.push({
      index: i + 1,
      act,
      beat,
      durationSec: durs[i + 1],
      conceptId: node.id,
      conceptName: node.name,
      visual: `${style.baseMedium}｜${node.visual}｜${style.camera}`,
      narration: node.narration,
      // 编辑规则：屏幕字优先承载术语。旁白已经点出术语时，屏幕字才允许用更口语的提示。
      // 这条规则是确定性的，也是"术语必须落地"这一检查项的来源。
      onScreen: node.narration.includes(node.name) ? node.onScreen : node.name,
      onScreenAt: onScreenTime(node.narration, durs[i + 1]),
      camera: style.camera,
      transition: i === 0 ? "承接钩子硬切" : style.transition,
    });
  });

  // 收尾镜
  shots.push({
    index: shotCount - 1,
    act: 3,
    beat: BEAT.close,
    durationSec: durs[shotCount - 1],
    conceptId: "__close__",
    conceptName: "收束",
    visual: `${style.baseMedium}｜最后一个概念画面定格，只留一处${style.palette[2].name}的余晖｜固定机位`,
    narration: graph.thesis,
    onScreen: "原来如此",
    onScreenAt: 0,
    camera: "固定机位，最后 1 秒缓慢淡出",
    transition: "淡出收尾",
  });

  return {
    styleId: style.id,
    durationTargetSec: target,
    shots,
    totalSec: Math.round(shots.reduce((a, s) => a + s.durationSec, 0) * 10) / 10,
    derivedFrom: `概念图 ${graph.nodes.length} 节点 / ${graph.edges.length} 条因果边 → 深度分层拓扑排序 → 3 幕 → ${shotCount} 镜`,
  };
}
