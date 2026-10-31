"use client";

import type { ConceptGraph } from "@/lib/types";

/**
 * 概念图渲染：按因果深度分层，从左到右表示"因 → 果"。
 * 这个图不是装饰，它和分镜一一对应：第 n 列就是上游，越往右越是后果。
 */

const NODE_W = 150;
const NODE_H = 64;
const GAP_X = 54;
const GAP_Y = 22;
const PAD = 22;

function computeDepths(graph: ConceptGraph): Map<string, number> {
  const ids = graph.nodes.map((n) => n.id);
  const depth = new Map<string, number>();
  ids.forEach((id) => depth.set(id, 0));

  // 迭代松弛，最多 n 轮，天然容忍环
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const e of graph.edges) {
      if (!depth.has(e.from) || !depth.has(e.to)) continue;
      const next = depth.get(e.from)! + 1;
      if (next > depth.get(e.to)! && next < ids.length) {
        depth.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

export default function GraphView({
  graph,
  activeId,
}: {
  graph: ConceptGraph;
  activeId?: string | null;
}) {
  const depths = computeDepths(graph);
  const maxDepth = Math.max(0, ...Array.from(depths.values()));

  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  graph.nodes.forEach((n) => columns[depths.get(n.id) ?? 0].push(n.id));

  const width = PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X;
  const rows = Math.max(...columns.map((c) => c.length), 1);
  const height = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y;

  const pos = new Map<string, { x: number; y: number }>();
  columns.forEach((col, ci) => {
    const colH = col.length * NODE_H + (col.length - 1) * GAP_Y;
    const startY = (height - colH) / 2;
    col.forEach((id, ri) => {
      pos.set(id, {
        x: PAD + ci * (NODE_W + GAP_X),
        y: startY + ri * (NODE_H + GAP_Y),
      });
    });
  });

  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
  const lastIds = new Set(columns[columns.length - 1] ?? []);

  return (
    <div className="graph-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        role="img"
        aria-label="概念因果图"
      >
        <defs>
          <marker
            id="gv-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M2 1L8 5L2 9"
              fill="none"
              stroke="#b4b2a9"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const dx = Math.max(28, (x2 - x1) * 0.5);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <path
                d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#d3d1c7"
                strokeWidth="1.2"
                markerEnd="url(#gv-arrow)"
              />
              <text
                x={mx}
                y={my - 6}
                textAnchor="middle"
                fontSize="9.5"
                fill="#918f86"
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {graph.nodes.map((node, i) => {
          const p = pos.get(node.id)!;
          const isLast = lastIds.has(node.id);
          const isActive = activeId === node.id;
          return (
            <g key={node.id}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx="9"
                fill={isActive ? "#fbeee9" : "#ffffff"}
                stroke={isActive ? "#c4442a" : isLast ? "#c9a49a" : "#dcd9cf"}
                strokeWidth={isActive ? 1.4 : 1}
              />
              <text
                x={p.x + 13}
                y={p.y + 24}
                fontSize="12.5"
                fontWeight="600"
                fill="#1a1a17"
                fontFamily="Songti SC, Georgia, serif"
              >
                {node.name.length > 11 ? `${node.name.slice(0, 11)}…` : node.name}
              </text>
              <text
                x={p.x + 13}
                y={p.y + 42}
                fontSize="9.5"
                fill="#918f86"
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
              >
                {String(i + 1).padStart(2, "0")} · {node.onScreen}
              </text>
              <text
                x={p.x + 13}
                y={p.y + 55}
                fontSize="9.5"
                fill="#b4b2a9"
                fontFamily="-apple-system, Segoe UI, Microsoft YaHei, sans-serif"
              >
                {node.discipline}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
