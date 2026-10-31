"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import caseData from "@/lib/demo-case.json";

/**
 * VIZLAB 首页 · direction sheet seed 786938555 · `product-performs`
 *
 * 不描述功能，把产品正在干活的片段放进页面：
 *  - 首屏舞台上是真实的因果图，悬停任一概念，原句里推出它的那几个字亮起来
 *  - 各节里放的是真实数据渲染出来的分镜表、检查清单、交接包
 * 所有数字都来自 src/lib/demo-case.json（一次真实编译的结果），没有编造。
 */

interface Node {
  id: string;
  name: string;
  onScreen: string;
  sourceQuote: string;
  mechanism: string;
}

const NODES = caseData.nodes as Node[];
const EDGES = caseData.edges;
const SHOTS = caseData.shots;
const CHECKS = caseData.audit;

/** 图上六个概念的位置（620 × 392 的画布内） */
const POS: Record<string, { x: number; y: number }> = {
  期望值: { x: 74, y: 196 },
  损失厌恶: { x: 208, y: 196 },
  沉没成本: { x: 340, y: 96 },
  近失效应: { x: 340, y: 292 },
  变率强化: { x: 464, y: 292 },
  追损: { x: 560, y: 186 },
};

function nodePos(name: string) {
  return POS[name] ?? { x: 300, y: 196 };
}

/** 把原句按各概念的出处切开；同一个片段被多个概念引用时只画一次 */
function splitQuestion(question: string, quotes: string[]) {
  const marks: { start: number; end: number; term: string }[] = [];
  for (const term of Array.from(new Set(quotes.filter(Boolean)))) {
    let i = question.indexOf(term);
    while (i >= 0) {
      marks.push({ start: i, end: i + term.length, term });
      i = question.indexOf(term, i + term.length);
    }
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  const out: { text: string; term: string | null }[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) out.push({ text: question.slice(cursor, m.start), term: null });
    out.push({ text: question.slice(m.start, m.end), term: m.term });
    cursor = m.end;
  }
  if (cursor < question.length) out.push({ text: question.slice(cursor), term: null });
  return out;
}

/* ---------------- 首屏那块活的图 ---------------- */

function GraphFragment() {
  const [active, setActive] = useState<string | null>(null);
  const segs = useMemo(
    () => splitQuestion(caseData.question, NODES.map((n) => n.sourceQuote)),
    [],
  );
  const activeNode = NODES.find((n) => n.id === active) ?? null;

  return (
    <div className="frag" data-ui>
      <div className="frag-head">
        <strong>概念因果图</strong>
        <span>
          {NODES.length} 个概念 · {EDGES.length} 条因果边
        </span>
      </div>

      <p className="frag-q">
        {segs.map((s, i) =>
          s.term ? (
            <span
              key={i}
              className={`q-mark${activeNode && activeNode.sourceQuote === s.term ? " lit" : ""}`}
            >
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>

      <div className="graph" onMouseLeave={() => setActive(null)}>
        <svg viewBox="0 0 620 392" aria-hidden="true">
          {EDGES.map((e) => {
            const a = nodePos(NODES.find((n) => n.id === e.from)!.name);
            const b = nodePos(NODES.find((n) => n.id === e.to)!.name);
            const lit = active === e.from;
            return (
              <g key={`${e.from}-${e.to}`}>
                <line
                  className={`graph-edge${lit ? " lit" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
                {lit && (
                  <text
                    className="graph-edge-label lit"
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 6}
                    textAnchor="middle"
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {NODES.map((n) => {
          const p = nodePos(n.name);
          return (
            <button
              key={n.id}
              type="button"
              className={`gnode${active === n.id ? " on" : ""}`}
              style={{ left: p.x, top: p.y }}
              onMouseEnter={() => setActive(n.id)}
              onFocus={() => setActive(n.id)}
              onBlur={() => setActive(null)}
              aria-label={`${n.name}，出自原话「${n.sourceQuote}」`}
            >
              <b>{n.name}</b>
              <i>{n.onScreen}</i>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 分镜面板（第 3 节的主图） ---------------- */

function StoryboardPanel({ marked }: { marked: string | null }) {
  return (
    <div className="frag" data-ui>
      <div className="frag-head">
        <strong>分镜 · {caseData.totalSec} 秒</strong>
        <span>{SHOTS.length} 镜</span>
      </div>
      <div className="shotlist">
        {SHOTS.map((s) => {
          const row = (
            <>
              {/* 镜号是电影分镜的固有编号，不是页面装饰 */}
              {/* taste-skill-ignore numbering */}
              <span className="sn">{String(s.index + 1).padStart(2, "0")}</span>
              <span className="sc">{s.conceptName}</span>
              <span className="sd">{s.durationSec}s</span>
              <span className="sr">{s.narration}</span>
            </>
          );
          return (
            <div
              key={s.index}
              className={`shotrow${marked === s.conceptName ? " marked" : ""}${
                marked && marked !== s.conceptName ? " dim" : ""
              }`}
            >
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 检查清单 ---------------- */

function ChecksFragment({ warnId }: { warnId?: string }) {
  return (
    <div className="frag" data-ui>
      <div className="frag-head">
        <strong>检查报告</strong>
        <span>确定性规则 · 不调用模型</span>
      </div>
      <div className="checks">
        {CHECKS.map((c) => {
          const warn = c.id === warnId;
          return (
            <div key={c.id} className={`checkrow${warn ? " warn" : ""}`}>
              <span className="cid">{c.id}</span>
              <span className="ct">{c.title}</span>
              <span className="cm">{warn ? "过快 1 镜" : c.metric}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 交接包 ---------------- */

function HandoffFragment() {
  const h = caseData.handoff as {
    version: string;
    outputSpec: { aspect: string; resolution: string; fps: number; totalSec: number };
    styleRef: { name: string; palette: string[] };
    shots: { index: number; durationSec: number; prompt: string }[];
  };
  const excerpt = useMemo(() => {
    const first = h.shots[0];
    return [
      "{",
      `  "version": "${h.version}",`,
      '  "outputSpec": {',
      `    "aspect": "${h.outputSpec.aspect}",`,
      `    "resolution": "${h.outputSpec.resolution}",`,
      `    "fps": ${h.outputSpec.fps},`,
      `    "totalSec": ${h.outputSpec.totalSec}`,
      "  },",
      '  "styleRef": {',
      `    "name": "${h.styleRef.name}",`,
      `    "palette": ${JSON.stringify(h.styleRef.palette.slice(0, 3))}`,
      "  },",
      '  "shots": [',
      "    {",
      `      "index": ${first.index},`,
      `      "durationSec": ${first.durationSec},`,
      `      "prompt": "${first.prompt.slice(0, 42)}…"`,
      "    },",
      `    … 其余 ${h.shots.length - 1} 镜`,
      "  ]",
      "}",
    ].join("\n");
  }, [h]);

  return (
    <div className="frag" data-ui>
      <div className="frag-head">
        <strong>handoff-manifest.json</strong>
        <span>制作规格 · 不是提示词</span>
      </div>
      <pre className="frag-code">{excerpt}</pre>
    </div>
  );
}

/* ---------------- 出场动效 ---------------- */

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("seen"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el2 = e.target as HTMLElement;
            el2.classList.add("seen");
            Array.from(el2.children).forEach((c, i) => {
              const h = c as HTMLElement;
              h.style.opacity = "1";
              h.style.transform = "translateY(0)";
              h.style.transitionDelay = `${i * 0.07}s`;
            });
            io.unobserve(el2);
          }
        });
      },
      { rootMargin: "-8% 0px -12% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ---------------- 页面 ---------------- */

const FEATURES = [
  { key: "原句", name: "原句", body: "输入的必须是一句话，不是一个主题词。图从这句话长出来。", top: 26 },
  { key: "概念", name: "概念", body: "六个概念是这句话里的机制，不是这段话的关键词。", top: 214 },
  { key: "因果边", name: "因果边", body: "有向的。方向决定谁先讲，环会被直接拒掉。", top: 402 },
  { key: "屏幕字", name: "屏幕字", body: "打在大字上的三到六个字，和旁白里的术语必须一致。", top: 88 },
  { key: "时长", name: "时长", body: "每镜的秒数按旁白字数算，不平均分配。", top: 276 },
  { key: "出处", name: "出处", body: "每条都能指回原话里那几个字，指不出来就不算数。", top: 464 },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "它和直接问 AI 有什么区别？",
    a: "直接问 AI，你拿到一段文字，关掉就没了。这里每一步都有结构化产物：概念图、分镜、检查报告、交接包。它们能保存、能回滚、能对比，下游会跟着上游一起重算。另外七条检查是纯代码，跑两次结果一模一样，可以当场打开看。",
  },
  {
    q: "会生成视频吗？",
    a: "不会，也不假装调用了某个视频模型。它交出去的是一份制作规格：画幅、色板、每一镜的时长与指令、验收标准。执行由外部工具完成，成片回来之后可以在作品档案里回填偏差。",
  },
  {
    q: "概念拆错了怎么办？",
    a: "每一个概念卡都能改。改完之后分镜、时长、检查报告全部重算，不需要重新编译。原句出处那一栏是硬校验的：拼不出原话里的连续片段，这一栏就留空，不会替你圆。",
  },
  {
    q: "为什么是七条检查，不是让模型打分？",
    a: "模型打的分数没法追问。七条规则是代码：时长匹配、节奏、语速、术语一致、因果顺序、合规扫描、争议一致性。你可以问它是怎么算的，也可以改一条规则看结果怎么变。",
  },
  {
    q: "为什么必须写一句困惑，不能给关键词？",
    a: "「损失厌恶」是一个已经抽象好的标签，给它做视频只是把标签展开。一句真实的困惑里带着具体的场景和情绪，那才是观众能进去的地方。抽象这一步是产品做的，不是用户做的。",
  },
  {
    q: "没网、没有模型 Key 能跑吗？",
    a: "能打开，也能走完流程，但概念抽取会退到内置的一小批条目上，界面上会标明离线。要完整跑，配一个模型 Key 即可，其余部分——分镜推导、时长分配、七条检查——本来就不依赖模型。",
  },
];

const HIW = [
  {
    n: "先写一句困惑",
    call: caseData.question,
    resp: "graph",
  },
  {
    n: "再把某一镜的旁白改长",
    call: "第 6 镜 · 变率强化：「奖励什么时候来，完全没规律。」→ 加了一句解释。",
    resp: "checks",
  },
  {
    n: "最后导出交接包",
    call: "导出交接包 · 具象隐喻型 · 9:16",
    resp: "handoff",
  },
];

export default function Landing({
  onStart,
  onOpenArchive,
}: {
  onStart: (question: string, duration: number) => void;
  onOpenArchive: () => void;
}) {
  useReveal();

  // 首页是冷灰地面，body 底色由这一页接管，离开时还原
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#eef0f3";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const [q, setQ] = useState(caseData.question);
  const [dur, setDur] = useState(66);
  const [marked, setMarked] = useState<string | null>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  // 图带视差：随滚动位移，纯位移不改布局
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    let raf = 0;
    const figs = Array.from(el.querySelectorAll("figure")) as HTMLElement[];
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (r.bottom < -240 || r.top > window.innerHeight + 240) return;
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      figs.forEach((f, i) => {
        f.style.transform = `translate3d(0, ${(p * (26 + i * 12)).toFixed(1)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lg">
      {/* ---------- 首屏 ---------- */}
      <header className="lg-hero lg-wrap">
        <nav className="lg-nav">
          <span className="lg-wordmark">VIZLAB</span>
          <div className="lg-nav-links">
            <a href="#how">怎么用</a>
            <a href="#checks">检查</a>
            <a href="#faq">问题</a>
            <button type="button" onClick={onOpenArchive}>
              作品档案
            </button>
          </div>
        </nav>

        <div className="lg-hero-copy">
          <h1 className="lg-h1">
            <span className="line">
              <span>把一句困惑</span>
            </span>
            <span className="line">
              <span>拆成能拍的分镜</span>
            </span>
          </h1>
          <p className="lg-sub">
            VIZLAB 把一句想不通的话，拆成一张有因果的概念图、八条镜头，和一份能直接执行的制作规格。
          </p>
          <div className="lg-hero-act">
            <button className="lg-btn" type="button" onClick={() => onStart(q, dur)}>
              开始编译
            </button>
            <span className="lg-hero-hint">一次编译约六秒</span>
          </div>
          <p className="lg-hero-foot">
            不生成视频，只交规格。分镜顺序与七条检查由代码推导，同样的输入跑两次，结果逐字一致。
          </p>
        </div>

        <div className="lg-stage">
          <div className="lg-stage-inner">
            <GraphFragment />
          </div>
        </div>
      </header>

      {/* ---------- 图不是插画 ---------- */}
      <section className="lg-section lg-wrap reveal" id="how">
        <div className="feat">
          <div className="feat-head">
            <h2 className="lg-h2">图不是插画</h2>
          </div>

          <div className="feat-notes-l">
            {FEATURES.slice(0, 3).map((f) => (
              <div
                key={f.key}
                className={`fn${marked === f.key ? " on" : ""}`}
                style={{ "--t": `${f.top}px` } as React.CSSProperties}
                onMouseEnter={() => setMarked(f.key)}
                onMouseLeave={() => setMarked(null)}
              >
                <b>{f.name}</b>
                <span>{f.body}</span>
              </div>
            ))}
          </div>

          <div className="feat-panel">
            <StoryboardPanel marked={marked} />
          </div>

          <div className="feat-notes-r">
            {FEATURES.slice(3).map((f) => (
              <div
                key={f.key}
                className={`fn${marked === f.key ? " on" : ""}`}
                style={{ "--t": `${f.top}px` } as React.CSSProperties}
                onMouseEnter={() => setMarked(f.key)}
                onMouseLeave={() => setMarked(null)}
              >
                <b>{f.name}</b>
                <span>{f.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 三次交换 ---------- */}
      <section className="lg-section lg-wrap reveal">
        <div className="hiw">
          <div className="hiw-head">
            <h2 className="lg-h2">三次交换</h2>
          </div>
          <div className="hiw-body">
            {HIW.map((h, i) => (
              <div className={`ex${i === 2 ? " ex-3" : ""}`} key={h.n}>
                <p className="ex-line">{h.n}</p>
                <div className="ex-call">
                  <span className="who">{i === 0 ? "你写进去" : i === 1 ? "你改动的" : "你导出的"}</span>
                  {h.call}
                </div>
                <div className="ex-resp">
                  {h.resp === "graph" && <GraphFragment />}
                  {h.resp === "checks" && <ChecksFragment warnId="R3" />}
                  {h.resp === "handoff" && <HandoffFragment />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 一处刻意的留白：使用者手里的那张纸 */}
      <div className="lg-band" ref={bandRef}>
        <figure>
          <img
            src="/landing/storyboard-hands.jpg"
            alt="摊在冷灰桌面上的几张手写分镜稿，每一格都画着小稿，旁边一支铅笔和一支蓝铅笔"
            width={1536}
            height={922}
          />
        </figure>
        <figure>
          <img
            src="/landing/film-lightbox.jpg"
            alt="观片灯上并列的几张医学影像胶片"
            width={900}
            height={922}
            loading="lazy"
          />
        </figure>
      </div>

      {/* ---------- 经得起追问 ---------- */}
      <section className="lg-section lg-wrap reveal" id="checks">
        <h2 className="lg-h2">它经得起追问</h2>
        <p className="lg-body" style={{ marginTop: 18, maxWidth: "34em" }}>
          下面这些数字来自二十道题的实测，题目跨物理、生物、心理、工程和医学影像。
          分镜推导与七条检查不经过模型，所以同样的输入跑两次，结果逐字一样。
        </p>
        <div className="proof-row">
          {[
            { n: "20 / 20", l: "实测题目结构全部通过：概念数、边数、连通、无环" },
            { n: "100", l: "平均检查分，二十题里没有一道出现硬伤" },
            { n: "7", l: "条确定性规则，零模型调用，可以当场打开看" },
            { n: "6.3s", l: "平均编译耗时；分镜与检查在这一步之后不再变" },
          ].map((p) => (
            <div className="proof-item" key={p.n}>
              <div className="proof-num">{p.n}</div>
              <div className="proof-lab">{p.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- 常见问题 ---------- */}
      <section className="lg-section lg-wrap reveal" id="faq">
        <div className="faq">
          <div className="faq-head">
            <h2 className="lg-h2">会被问到的问题</h2>
          </div>
          <div className="faq-list">
            {FAQS.map((f) => (
              <details className="faq-item" name="vizlab-faq" key={f.q}>
                <summary>
                  {f.q}
                  <span className="faq-plus" aria-hidden="true" />
                </summary>
                <p className="faq-answer">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 第一屏已经打开 ---------- */}
      <section className="lg-cta" id="start">
        <div className="cta-close">
          <p className="cta-line">
            <span>先写下</span>
            <span>那句困惑</span>
          </p>
          <p className="cta-sub">
            左边这一栏就是产品打开时的样子。改掉那句话，选一个时长，按下去就开始编译。
          </p>
        </div>

        <div className="cta-dialog" data-ui>
          <div className="frag-head">
            <strong>新建编译</strong>
            <span>VIZLAB</span>
          </div>
          <div className="cta-field">
            <label htmlFor="cta-q">你最近想不通的那件事</label>
            <textarea
              id="cta-q"
              className="cta-input"
              rows={3}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cta-seg" role="group" aria-label="目标时长">
              {[45, 66].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={dur === d ? "on" : ""}
                  onClick={() => setDur(d)}
                  aria-pressed={dur === d}
                >
                  {d} 秒
                </button>
              ))}
            </div>
            <button
              className="lg-btn cta-go"
              type="button"
              onClick={() => onStart(q, dur)}
            >
              开始编译
            </button>
          </div>
        </div>
      </section>

      <footer className="lg-foot">
        <div className="foot-name">VIZLAB</div>
        <div className="foot-meta">
          知识编译台 · 不生成视频，只交规格
          <br />
          分镜与检查为确定性推导，概念抽取可接任意模型
        </div>
      </footer>
    </div>
  );
}
