"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudienceReport, ConceptGraph, Storyboard } from "@/lib/types";

/**
 * 观众预演
 *
 * 两条通道分开展示，不混成一个分数：
 *  - 曲线与处方来自模型，标注「模型估计」
 *  - 提前引用 / 数量对不上 / 开场过载 来自纯算法，标注「规则判定」
 *
 * 处方是可执行的：点「采用处方」直接替换旁白，然后自动重演。
 * 改进前的曲线用虚线留在图上——那条虚线被顶上去的过程，才是这个产品的重点。
 */

const W = 640;
const H = 230;
const PAD_L = 42;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 44;

function Chart({
  report,
  previous,
  stuckShots,
}: {
  report: AudienceReport;
  previous: AudienceReport | null;
  stuckShots: Set<number>;
}) {
  const probes = report.probes;
  const n = probes.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const px = (i: number) => (n <= 1 ? PAD_L : PAD_L + (i * plotW) / (n - 1));
  const py = (v: number) => PAD_T + plotH - (v / 100) * plotH;

  const line = probes.map((p, i) => `${px(i)},${py(p.comprehension)}`).join(" ");
  const area = `${PAD_L},${PAD_T + plotH} ${line} ${px(n - 1)},${PAD_T + plotH}`;

  const prevLine =
    previous && previous.probes.length === n
      ? previous.probes.map((p, i) => `${px(i)},${py(p.comprehension)}`).join(" ")
      : null;

  const stuckIdx = probes
    .map((p, i) => ({ p, i }))
    .filter((x) => stuckShots.has(x.p.shotIndex))
    .map((x) => x.i);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", width: "100%", height: "auto" }}
      role="img"
      aria-label="观众理解度随镜号变化的折线图，改进前的曲线以虚线叠加"
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={py(v)} y2={py(v)} stroke="#e3e1d9" strokeWidth="0.5" />
          <text
            x={PAD_L - 8}
            y={py(v)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize="10"
            fill="#918f86"
            fontFamily="ui-monospace, Menlo, Consolas, monospace"
          >
            {v}%
          </text>
        </g>
      ))}

      {prevLine && (
        <polyline
          points={prevLine}
          fill="none"
          stroke="#b4b2a9"
          strokeWidth="1.4"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
      )}

      <polygon points={area} fill="rgba(196,68,42,0.06)" />
      <polyline
        points={line}
        fill="none"
        stroke="#534ab7"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {stuckIdx.map((i) => (
        <circle
          key={`ring-${i}`}
          cx={px(i)}
          cy={py(probes[i].comprehension)}
          r="10"
          fill="none"
          stroke="#e8c0bc"
          strokeWidth="1"
        />
      ))}

      {probes.map((p, i) => {
        const isStuck = stuckShots.has(p.shotIndex);
        return (
          <g key={p.shotIndex}>
            <circle
              cx={px(i)}
              cy={py(p.comprehension)}
              r={isStuck ? 5.5 : 3.5}
              fill={isStuck ? "#a32d2d" : "#534ab7"}
              stroke="#fff"
              strokeWidth="1.5"
            />
            <text
              x={px(i)}
              y={H - PAD_B + 17}
              textAnchor="middle"
              fontSize="10"
              fill="#918f86"
              fontFamily="ui-monospace, Menlo, Consolas, monospace"
            >
              {String(p.shotIndex + 1).padStart(2, "0")}
            </text>
            <text x={px(i)} y={H - PAD_B + 30} textAnchor="middle" fontSize="9.5" fill="#b4b2a9">
              {p.conceptName.length > 5 ? `${p.conceptName.slice(0, 5)}…` : p.conceptName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function AudiencePanel({
  graph,
  storyboard,
  onApply,
}: {
  graph: ConceptGraph;
  storyboard: Storyboard;
  onApply: (shotIndex: number, rewrite: string) => void;
}) {
  const [report, setReport] = useState<AudienceReport | null>(null);
  const [previous, setPrevious] = useState<AudienceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenGraph = useRef(graph);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, storyboard }),
      });
      const d = await r.json();
      if (!d.ok) setError(d.message ?? "观众模拟失败");
      else setReport(d.report);
    } catch {
      setError("网络异常");
    } finally {
      setLoading(false);
    }
  }, [graph, storyboard]);

  // 采纳处方后 graph 会变，自动重演一次，并把上一版留作虚线对照
  useEffect(() => {
    if (seenGraph.current === graph) return;
    seenGraph.current = graph;
    if (!report) return;
    setPrevious(report);
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const notes = report?.notes ?? [];
  const modelStuck = report?.probes.filter((p) => p.stuck) ?? [];
  const stuckShots = new Set<number>([
    ...notes.map((x) => x.shotIndex),
    ...modelStuck.map((p) => p.shotIndex),
  ]);

  const before = previous
    ? previous.notes.length + previous.probes.filter((p) => p.stuck).length
    : 0;
  const after = notes.length + modelStuck.length;

  return (
    <div>
      {!report && (
        <div className="card" style={{ padding: "22px 24px" }}>
          <p className="lede" style={{ marginBottom: 16 }}>
            让一个只有大众常识的观众，把这条脚本从头听一遍。他只听得见旁白，看不见画面——
            所以他听不懂的地方，静音刷到的人也一定听不懂。
          </p>
          <div className="row">
            <button className="btn btn-accent" onClick={() => void fetchReport()} disabled={loading}>
              {loading ? (
                <>
                  <span className="spin" /> 观众正在听
                </>
              ) : (
                "让观众听一遍 →"
              )}
            </button>
            <span className="small muted">约 8 秒</span>
          </div>
        </div>
      )}

      {error && (
        <div className="notice" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {loading && report && (
        <div className="card-flat small muted" style={{ marginBottom: 12 }}>
          正在重新预演…
        </div>
      )}

      {report && (
        <>
          {previous && (
            <div className="card-flat row" style={{ marginBottom: 14, gap: 16 }}>
              <span className="badge badge-accent">已应用处方</span>
              <span className="small">
                卡点 <strong>{before}</strong> 处 → <strong>{after}</strong> 处
              </span>
              <span className="small">
                终点理解度 <strong>{previous.endingComprehension}%</strong> →{" "}
                <strong>{report.endingComprehension}%</strong>
              </span>
              <span className="spacer" />
              <span className="small muted">灰色虚线是改进前</span>
            </div>
          )}

          <div className="card" style={{ padding: "16px 20px" }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="badge badge-src">模拟观众</span>
              <span className="small">{report.persona}</span>
              <span className="spacer" />
              <span className="mono muted">
                终点 {report.endingComprehension}%
                {report.worstShot !== null &&
                  ` · 最大回落 第 ${report.worstShot + 1} 镜${
                    report.worstDrop > 0 ? ` −${report.worstDrop}%` : ""
                  }`}
              </span>
            </div>
            <Chart report={report} previous={previous} stuckShots={stuckShots} />
          </div>

          <div style={{ marginTop: 14 }}>
            {after === 0 ? (
              <div className="card-flat small" style={{ color: "var(--ok)" }}>
                全程没有卡点。这个观众听完了整条脚本，没有出现要靠猜才能接上的地方；
                结构检查也没有发现提前引用、数量对不上或开场过载。
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notes.map((nt) => (
                  <div className="card" key={nt.id} style={{ padding: "14px 18px" }}>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <span className="badge badge-src">规则判定</span>
                      <strong style={{ fontSize: 13 }}>
                        第 {nt.shotIndex + 1} 镜 · {nt.title}
                      </strong>
                      <span className="spacer" />
                      <span className="mono muted">零模型调用</span>
                    </div>
                    <p className="small" style={{ color: "var(--ink-2)" }}>
                      {nt.detail}
                    </p>
                    {nt.rewrite ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="small muted" style={{ marginBottom: 4 }}>
                          改写为：
                        </div>
                        <p style={{ fontSize: 13, color: "var(--ink)" }}>「{nt.rewrite}」</p>
                        <button
                          className="btn btn-sm btn-accent"
                          style={{ marginTop: 8 }}
                          onClick={() => onApply(nt.shotIndex, nt.rewrite!)}
                        >
                          采用处方
                        </button>
                      </div>
                    ) : (
                      <p className="small muted" style={{ marginTop: 8 }}>
                        这一条需要手动调整，无法自动替换。
                      </p>
                    )}
                  </div>
                ))}

                {modelStuck.map((p) => (
                  <div className="card" key={`m-${p.shotIndex}`} style={{ padding: "14px 18px" }}>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <span className="badge">模型估计</span>
                      <strong style={{ fontSize: 13 }}>
                        第 {p.shotIndex + 1} 镜 · {p.conceptName}
                      </strong>
                      <span className="spacer" />
                      <span className="mono muted">{p.comprehension}%</span>
                    </div>
                    <p className="small" style={{ color: "var(--ink-2)" }}>
                      {p.stuck}
                    </p>
                    {p.question && (
                      <p className="small" style={{ color: "var(--ink-3)", marginTop: 4 }}>
                        观众此刻会想：{p.question}
                      </p>
                    )}
                    {p.missingPrereq && (
                      <p className="small" style={{ marginTop: 6 }}>
                        <span className="badge">缺前置</span>{" "}
                        <span style={{ color: "var(--ink-2)" }}>{p.missingPrereq}</span>
                      </p>
                    )}
                    {p.rewrite ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="small muted" style={{ marginBottom: 4 }}>
                          改写为：
                        </div>
                        <p style={{ fontSize: 13, color: "var(--ink)" }}>「{p.rewrite}」</p>
                        <button
                          className="btn btn-sm btn-accent"
                          style={{ marginTop: 8 }}
                          onClick={() => onApply(p.shotIndex, p.rewrite!)}
                        >
                          采用处方
                        </button>
                      </div>
                    ) : (
                      p.patch && (
                        <p className="small" style={{ marginTop: 8, color: "var(--ink)" }}>
                          处方：{p.patch}
                        </p>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="small muted" style={{ marginTop: 12 }}>
            「模型估计」的理解度是主观估计，不是测量值，只当「哪儿可能卡」的提示。
            「规则判定」那几条是纯算法算出来的——提前引用、数量对不上、开场过载，
            跑两次结果一致，不需要模型背书，共 {notes.length} 处。
          </p>
        </>
      )}
    </div>
  );
}
