"use client";

import { useEffect, useState } from "react";
import type { Delivery, Project } from "@/lib/types";

/**
 * 回执面板：把「规格」和「真实成片」对上。
 * 偏差是这套流程可信的证据——所以它被显式记录，而不是被藏起来。
 */
export default function ProjectDetail({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [source, setSource] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [devText, setDevText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        const p = d.project as Project;
        setProject(p);
        if (p.delivery) {
          setSource(p.delivery.source);
          setDurationSec(String(p.delivery.durationSec));
          setPublishedAt(p.delivery.publishedAt ?? "");
          setNote(p.delivery.note);
          setDevText(
            p.delivery.deviations.map((x) => `${x.shotIndex}|${x.note}`).join("\n"),
          );
        }
      })
      .catch(() => undefined);
  }, [id]);

  async function submit() {
    if (!project) return;
    setSaving(true);
    const deviations = devText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [a, ...rest] = line.split("|");
        const idx = Number.parseInt(a, 10);
        return {
          shotIndex: Number.isFinite(idx) ? idx : 0,
          note: rest.join("|").trim() || a.trim(),
        };
      });

    const delivery: Delivery = {
      source: source.trim() || "未填写来源",
      durationSec: Number.parseFloat(durationSec) || project.storyboard.totalSec,
      publishedAt: publishedAt.trim() || undefined,
      deviations,
      note: note.trim(),
    };

    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery, status: "delivered" }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.ok) {
      setProject(d.project);
      onSaved();
    }
  }

  if (!project) {
    return <div className="card-flat small muted">读取中…</div>;
  }

  const spec = project.storyboard.totalSec;
  const actual = Number.parseFloat(durationSec);
  const diff = Number.isFinite(actual) ? Math.round((actual - spec) * 10) / 10 : null;

  return (
    <div className="card" style={{ marginTop: 12, background: "var(--surface-2)" }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>执行回执 · {project.title}</h3>
        <span className="badge">{project.graph.coverage === "seed" ? "种子编译" : "模型抽取"}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          收起
        </button>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div>
          <dl className="kv">
            <dt>论点</dt>
            <dd>{project.graph.thesis}</dd>
            <dt>规格时长</dt>
            <dd>{spec}s</dd>
            <dt>镜头数</dt>
            <dd>{project.storyboard.shots.length}</dd>
            <dt>检查得分</dt>
            <dd>{project.audit.score}</dd>
            <dt>概念</dt>
            <dd>{project.graph.nodes.map((n) => n.name).join(" → ")}</dd>
          </dl>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>
            录入执行结果（成片回来后填写）
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              className="input"
              style={{ padding: "8px 10px", fontSize: 13 }}
              placeholder="成片来源，如 抖音 @账号 / 本地文件"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <div className="row-tight">
              <input
                className="input"
                style={{ padding: "8px 10px", fontSize: 13, width: 130 }}
                placeholder="实际时长（秒）"
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
              />
              <input
                className="input"
                style={{ padding: "8px 10px", fontSize: 13, flex: 1 }}
                placeholder="发布日期"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
            </div>
            <textarea
              className="input"
              rows={3}
              style={{ padding: "8px 10px", fontSize: 12.5 }}
              placeholder={"偏差记录，一行一条，格式：镜号|说明\n例：4|模型自行加了推镜，偏离固定机位规格"}
              value={devText}
              onChange={(e) => setDevText(e.target.value)}
            />
            <input
              className="input"
              style={{ padding: "8px 10px", fontSize: 13 }}
              placeholder="一句话备注"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => void submit()} disabled={saving}>
                {saving ? "保存中" : "保存回执"}
              </button>
              {diff !== null && (
                <span className={Math.abs(diff) <= spec * 0.1 ? "badge badge-ok" : "badge badge-warn"}>
                  时长偏差 {diff > 0 ? "+" : ""}
                  {diff}s
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {project.delivery && project.delivery.deviations.length > 0 && (
        <>
          <div className="divider" />
          <div className="small muted" style={{ marginBottom: 6 }}>
            已记录的偏差
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)" }}>
            {project.delivery.deviations.map((d, i) => (
              <li key={i}>
                第 {d.shotIndex} 镜 · {d.note}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
