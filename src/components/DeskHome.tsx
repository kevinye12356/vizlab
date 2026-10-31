"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MorphOrb from "@/components/MorphOrb";

/**
 * 深夜书桌 · 场景版
 *
 * 台灯 SVG 线稿在右上，光锥斜投向左下，光池落在桌面中央。
 * 桌面上的纸卡片是被灯照亮的，离光池越远越暗。
 *
 * 输入入口是 MorphOrb（移植自 21st.dev 的 ai-thiking-orb-and-input）：
 * 底部药丸打字 → 回车 → 飞进光锥里变成点阵球体思考 → 落成一张纸卡显示论点
 * → 稍后自动开灯进入明亮工作台。
 *
 * 台灯的一切位置由 desk.css 的 --lamp-x/--lamp-y/--pool-x/--pool-y 统一推导，
 * 球体舞台中心（orb.css 的 --stage-y: 46%）与光锥路径对齐。
 */

interface ProjectLite {
  id: string;
  question: string;
  status: "draft" | "handoff" | "delivered";
  score: number;
  totalSec: number;
}

const STATUS_TEXT: Record<string, string> = {
  draft: "草稿",
  handoff: "已交接",
  delivered: "已回执",
};

/* ---------- 卡片位置（百分比，避开球体舞台与底部药丸） ---------- */

const CARD_SPOTS = [
  { x: 30, y: 58, rz: -2.2 },
  { x: 70, y: 58, rz: 3.1 },
  { x: 16, y: 74, rz: -3.5 },
  { x: 80, y: 74, rz: 1.8 },
  { x: 42, y: 70, rz: -1.4 },
  { x: 60, y: 70, rz: 2.8 },
];

/* 光池中心：必须与 desk.css 里的 --pool-x / --pool-y 一致 */
const POOL = { x: 50, y: 66 };

/** 到光池中心的距离 → 亮度。光池里的最亮，最远的只剩轮廓。 */
function brightnessFor(x: number, y: number): number {
  const dx = (x - POOL.x) / 100;
  const dy = (y - POOL.y) / 100;
  const d = Math.sqrt(dx * dx * 2 + dy * dy * 4);
  if (d < 0.25) return 1;
  if (d < 0.4) return 0.88;
  if (d < 0.5) return 0.72;
  return 0.55;
}

/** 阴影统一投向远离台灯的方向：灯在右上，影子落向左下；越远越长越虚 */
function shadowFor(x: number, y: number): string {
  const d = Math.sqrt(((x - POOL.x) / 100) ** 2 * 2 + ((y - POOL.y) / 100) ** 2 * 4);
  const len = Math.min(1, d * 2.2);
  const off = 4 + len * 8;
  const blur = 18 + len * 20;
  const alpha = 0.35 + len * 0.22;
  return `-${off}px ${off + 8}px ${blur}px -${Math.round(off * 0.5)}px rgba(0,0,0,${alpha.toFixed(2)})`;
}

/* ---------- 台灯 SVG ---------- */

function LampSVG() {
  return (
    <svg className="lamp-svg" viewBox="0 0 340 380" fill="none" aria-hidden="true">
      <path d="M 760,-10 C 560,50 400,120 280,170" stroke="#2a2118" strokeWidth="10" strokeLinecap="round" />
      <circle cx="280" cy="170" r="10" fill="#2a2118" />
      <path d="M 280,170 L 220,200" stroke="#2a2118" strokeWidth="8" strokeLinecap="round" />
      <path d="M 200,195 L 240,195 L 252,235 L 188,235 Z" fill="#2a2118" />
      <ellipse cx="220" cy="235" rx="32" ry="6" fill="rgba(255,184,107,0.5)" />
      <path d="M 210,195 L 218,195" stroke="rgba(255,215,140,0.15)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- 灰尘颗粒 ---------- */

function DustCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const count = window.innerWidth <= 760 ? 20 : 46;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.4,
      vy: -(0.15 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * 0.12,
      o: 0.15 + Math.random() * 0.35,
    }));

    let raf = 0;
    function tick() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -4) p.y = h + 4;
        if (p.y > h + 4) p.y = -4;
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,215,140,${p.o})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="dust-canvas" aria-hidden="true" />;
}

/* ---------- 拉绳：拉一下，把光标送进输入 ---------- */

function PullCord({ onTrigger }: { onTrigger: () => void }) {
  const [pulled, setPulled] = useState(false);
  const busyRef = useRef(false);

  const pull = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPulled(true);
    window.setTimeout(() => {
      setPulled(false);
      onTrigger();
      busyRef.current = false;
    }, 320);
  }, [onTrigger]);

  return (
    <button
      className={`pull-cord${pulled ? " pulled" : ""}`}
      onClick={pull}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pull();
        }
      }}
      aria-label="拉开台灯，开始写"
      type="button"
    >
      <svg viewBox="0 0 24 150" fill="none" aria-hidden="true">
        <line className="cord-line" x1="12" y1="0" x2="12" y2="108" />
        <circle className="cord-bead" cx="12" cy="118" r="7" />
      </svg>
    </button>
  );
}

/* ---------- 主组件 ---------- */

export default function DeskHome({
  projects,
  onPick,
  onOpenProject,
  onCompile,
  onEnter,
}: {
  projects: ProjectLite[];
  onPick: (question: string) => void;
  onOpenProject: (id: string) => void;
  /** 回车后真正编译；ok 为 false 时不进工作台 */
  onCompile: (question: string) => Promise<{ ok: boolean; text: string }>;
  /** 答案落定后开灯，进入明亮工作台 */
  onEnter: () => void;
}) {
  const [questions, setQuestions] = useState<string[]>([]);
  const [lit, setLit] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const coneRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const flickerRef = useRef(0);
  const okRef = useRef(false);
  const enterTimer = useRef(0);
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.questions)) {
          setQuestions(d.questions.map((q: { text: string }) => q.text).slice(0, 6));
        }
      })
      .catch(() => undefined);
  }, []);

  const doneMap = useMemo(() => {
    const m = new Map<string, ProjectLite>();
    projects.forEach((p) => m.set(p.question.trim(), p));
    return m;
  }, [projects]);

  /* 呼吸 + 偶发轻闪 */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const flicker = () => {
      const cone = coneRef.current;
      const pool = poolRef.current;
      if (!cone || !pool) return;
      cone.classList.add("lamp-flicker");
      pool.classList.add("lamp-flicker");
      window.setTimeout(() => {
        cone.classList.remove("lamp-flicker");
        pool.classList.remove("lamp-flicker");
      }, 140);
      flickerRef.current = window.setTimeout(flicker, 8000 + Math.random() * 6000);
    };
    flickerRef.current = window.setTimeout(flicker, 5000 + Math.random() * 4000);
    return () => window.clearTimeout(flickerRef.current);
  }, []);

  /* 鼠标视差 */
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const cx = e.clientX / window.innerWidth - 0.5;
      const cy = e.clientY / window.innerHeight - 0.5;
      const cone = coneRef.current;
      if (cone) cone.style.transform = `translate3d(${cx * 4}px, ${cy * 3}px, 0)`;
      const pool = poolRef.current;
      if (pool) pool.style.transform = `translate(-50%, -50%) scaleX(1.3) translate(${cx * 10}px, ${cy * 8}px)`;
      const glow = glowRef.current;
      if (glow) glow.style.transform = `translate(${cx * 6}px, ${cy * 5}px)`;
    });
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(enterTimer.current);
    },
    [],
  );

  /* 卡片飞出 + 开灯 */
  function depart(fn: () => void) {
    const root = rootRef.current;
    if (root) root.classList.add("departing");
    window.setTimeout(() => {
      fn();
      if (root) root.classList.remove("departing");
    }, 520);
  }

  /* 球体答完 → 让答案停一会儿 → 开灯进工作台 */
  const handleAnswered = useCallback(() => {
    window.clearTimeout(enterTimer.current);
    if (!okRef.current) return;
    enterTimer.current = window.setTimeout(() => enterRef.current(), 2600);
  }, []);

  const focusInput = useCallback(() => {
    document.getElementById("mo-field")?.focus({ preventScroll: true });
    setLit(true);
    window.setTimeout(() => setLit(false), 1000);
  }, []);

  return (
    <div
      className={`desk-night${lit ? " lit" : ""}`}
      ref={rootRef}
      onMouseMove={onMouseMove}
    >
      <div className="desk-horizon" />
      <div className="desk-surface" />
      <div className="lamp-cone" ref={coneRef} />
      <div className="light-pool" ref={poolRef} />
      <div className="lamp-core" ref={glowRef} />
      <LampSVG />
      <DustCanvas />
      <PullCord onTrigger={focusInput} />

      <div className="desk-inner">
        <div className="desk-mark">
          <i />
          VIZLAB · 知识编译台
        </div>
        <h1 className="desk-title">
          一句想不通的话，
          <br />
          值得为它<em>开一盏灯</em>
        </h1>
        <p className="desk-sub">
          在灯下写下那句话，回车。它会飞进光里被拆成一张有因果的概念图，
          八条镜头，和一份能直接执行的制作规格。
        </p>
      </div>

      <div className="desk-cards">
        {questions.map((q, i) => {
          const spot = CARD_SPOTS[i] ?? CARD_SPOTS[0];
          const done = doneMap.get(q.trim());
          return (
            <button
              key={q}
              type="button"
              className="card"
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                filter: `brightness(${brightnessFor(spot.x, spot.y)})`,
                boxShadow: shadowFor(spot.x, spot.y),
                transform: `rotate(${spot.rz}deg)`,
              }}
              onClick={() => depart(() => (done ? onOpenProject(done.id) : onPick(q)))}
            >
              <span className="card-tag">{done ? "已编译" : "待拆"}</span>
              {q}
              {done && (
                <span className="card-done">
                  {STATUS_TEXT[done.status]} · 检查 {done.score} · {done.totalSec}s
                </span>
              )}
            </button>
          );
        })}
      </div>

      <MorphOrb
        onSubmit={async (text) => {
          const res = await onCompile(text);
          okRef.current = res.ok;
          return res.text;
        }}
        onAnswered={handleAnswered}
      />
    </div>
  );
}
