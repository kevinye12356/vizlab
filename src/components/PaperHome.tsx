"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * 首页：一张被台灯照着的书桌，散落着一桌「为什么」。
 *
 * 视觉上的丰富不是靠堆装饰，而是靠三件本来就有、之前没显示出来的差异：
 *  1. 学科 —— 每个问题分属不同领域，各自一个颜色（只用在细边和标签上）
 *  2. 体量 —— 短问句给大字号，长问句给小字号，形成疏密
 *  3. 前后 —— 纸片错落叠放，有压有露
 *
 * 交互：点没做过的 → 直接开始编译；点做过的 → 回到那份方案；空白纸片 → 自己写。
 */

interface ProjectLite {
  id: string;
  question: string;
  title: string;
  status: "draft" | "handoff" | "delivered";
  score: number;
  totalSec: number;
}

interface SlipQ {
  text: string;
  category: string;
}

const STATUS_TEXT: Record<string, string> = {
  draft: "草稿",
  handoff: "已交接",
  delivered: "已回执",
};

/* ---------------- 学科与配色 ---------------- */

interface Discipline {
  key: string;
  color: string;
  words: string[];
}

const DISCIPLINES: Discipline[] = [
  {
    key: "影像",
    color: "#e2685e",
    words: ["MRI", "核磁", "磁共振", "CT", "PET", "影像", "X光", "扫描", "弛豫", "超声", "造影"],
  },
  {
    key: "医学",
    color: "#dd5f92",
    words: ["抗生素", "耐药", "疗程", "细菌", "病毒", "免疫", "药", "病", "癌", "血糖", "疫苗"],
  },
  {
    key: "生物",
    color: "#3fb98d",
    words: ["猫", "章鱼", "蚊子", "树", "鱼", "鸟", "进化", "神经", "脑", "睡", "熬夜", "哈欠", "尾巴", "头发"],
  },
  {
    key: "物理",
    color: "#6d8bf5",
    words: ["冰", "光", "闪电", "引力", "黑洞", "月亮", "天空", "蓝", "热", "力", "声", "磁", "太阳", "自转", "滑"],
  },
  {
    key: "化学",
    color: "#a97ce8",
    words: ["分子", "酸", "咸", "气味", "氧化", "燃烧", "金属", "盐", "反应"],
  },
  {
    key: "心理",
    color: "#e0a03c",
    words: ["赌", "赢", "输", "上瘾", "记不住", "传染", "胖", "痛", "害怕", "感觉", "选择", "我们"],
  },
  {
    key: "工程",
    color: "#7aa6c9",
    words: ["飞机", "机翼", "桥", "车", "机器", "算法", "手机", "网络", "电脑", "引擎"],
  },
  {
    key: "地理",
    color: "#3cbcc4",
    words: ["海", "雨", "山", "气候", "地球", "地震", "河", "天气", "城市"],
  },
];

function pickDiscipline(text: string): Discipline {
  for (const d of DISCIPLINES) {
    if (d.words.some((w) => text.includes(w))) return d;
  }
  // 没有命中关键词时按文本哈希分到一个学科，保证整桌颜色是散开的
  return DISCIPLINES[hashText(text) % DISCIPLINES.length];
}

/** 把学科色以极低不透明度混到纸色上，得到一张"带薄染的纸"的固有色值 */
function tint(hex: string, amount: number, base = "#fdfaf3"): string {
  const h = hex.replace("#", "");
  const b = base.replace("#", "");
  const mix = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16);
    const k = parseInt(b.slice(i, i + 2), 16);
    return Math.round(k + (c - k) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/* ---------------- 布局的确定性随机 ---------------- */

function hashText(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function slipLayout(text: string) {
  const h = hashText(text);
  const hero = h % 4 === 0;
  const len = text.length;

  const fontSize = hero
    ? len <= 10
      ? 30
      : len <= 15
        ? 24
        : 19
    : len <= 10
      ? 17
      : len <= 15
        ? 15
        : 13;

  // 窄纸片：把宽度压到会折行，制造"又窄又高"的一类，撑开整桌的节奏
  const narrow = !hero && h % 5 === 0;
  const wide = h % 6 === 0;

  return {
    hero,
    fontSize,
    rotate: ((h % 57) - 28) / 10, // -2.8 ~ +2.8 度
    duration: 13 + (h % 9),
    delay: -((h >> 3) % 17),
    marginTop: hero ? (h >> 5) % 20 : (h >> 5) % 30,
    z: hero ? 8 + (h % 3) : 1 + (h % 4),
    maxWidth: narrow ? 112 : wide ? 300 : undefined,
  };
}

/* ---------------- 组件 ---------------- */

export default function PaperHome({
  projects,
  onPick,
  onBlank,
  onOpenProject,
}: {
  projects: ProjectLite[];
  onPick: (question: string) => void;
  onBlank: () => void;
  onOpenProject: (id: string) => void;
}) {
  const [questions, setQuestions] = useState<SlipQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"cache" | "model" | "offline">("cache");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.questions)) setQuestions(d.questions);
        if (d.source) setSource(d.source);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const doneMap = useMemo(() => {
    const m = new Map<string, ProjectLite>();
    projects.forEach((p) => m.set(p.question.trim(), p));
    return m;
  }, [projects]);

  const slips = useMemo(
    () =>
      questions.map((q) => {
        const disc = pickDiscipline(q.text);
        return { ...q, project: doneMap.get(q.text.trim()), disc };
      }),
    [questions, doneMap],
  );

  const fieldCount = useMemo(
    () => new Set(slips.map((s) => s.disc.key)).size,
    [slips],
  );

  return (
    <div className="desk">
      <div className="desk-lamp" />
      <div className="desk-grain" />
      <div className="desk-aura aura-a" />
      <div className="desk-aura aura-b" />
      <div className="desk-aura aura-c" />
      <div className="desk-vignette" />

      <div className="desk-head">
        <div className="desk-head-main">
          <div className="brand-row">
            <span className="brand-mark">VIZLAB</span>
            <span className="brand-divider" />
            <span className="brand-sub">知识编译台</span>
          </div>
          <h1 className="desk-title">
            一桌还没被
            <span className="hl">拆开</span>
            的为什么
          </h1>
          <p className="desk-desc">
            每一个「为什么」背后都藏着一条因果链。点一张，它就开始被拆成概念、镜头和一份能直接执行的分镜规格。
          </p>
        </div>

        <div className="desk-flow">
          <div className="desk-flow-label">一次编译走完七步</div>
          {[
            ["01", "输入", "一句具体的困惑"],
            ["02", "概念", "拆成因果图"],
            ["03", "预演", "观众在哪卡住"],
            ["04", "视觉", "选一套视觉语法"],
            ["05", "分镜", "推导与七条检查"],
            ["06", "交接", "导出执行规格"],
            ["07", "档案", "成片与偏差回执"],
          ].map(([n, name, hint]) => (
            <div className="desk-flow-item" key={n}>
              <b>{n}</b>
              <span className="nm">{name}</span>
              <span className="hint">{hint}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="desk-bar">
        <span className="desk-stat">
          <b>{slips.length || "—"}</b> 个困惑
        </span>
        <span className="desk-stat-sep" />
        <span className="desk-stat">
          <b>{fieldCount || "—"}</b> 个领域
        </span>
        <span className="desk-stat-sep" />
        <span className="desk-stat">
          <b>{projects.length}</b> 份已编译
        </span>
        <span className="spacer" />
        {source === "offline" && <span className="desk-badge">离线模式</span>}
        <button className="desk-btn" onClick={() => setPaused((v) => !v)}>
          {paused ? "继续漂浮" : "停"}
        </button>
      </div>

      {loading ? (
        <div className="desk-loading">
          <span className="desk-spinner" />
          正在铺开桌面…
        </div>
      ) : (
        <div className="slip-field">
          {slips.map((q) => {
            const L = slipLayout(q.text);
            const done = q.project;
            const color = q.disc.color;
            return (
              <button
                key={q.text}
                className={[
                  "slip",
                  L.hero ? "hero" : "",
                  done ? "done" : "",
                  paused ? "still" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--c": color,
                    "--soft": tint(color, 0.16),
                    "--r": `${L.rotate}deg`,
                    "--d": `${L.duration}s`,
                    "--delay": `${L.delay}s`,
                    "--mt": `${L.marginTop}px`,
                    "--z": L.z,
                    fontSize: L.fontSize,
                    maxWidth: L.maxWidth,
                  } as React.CSSProperties
                }
                onClick={() => (done ? onOpenProject(done.id) : onPick(q.text))}
              >
                <span className="slip-disc">
                  <i style={{ background: color }} />
                  {q.disc.key}
                </span>
                <span className="slip-text">{q.text}</span>

                {done && (
                  <span className="slip-receipt">
                    <b>{STATUS_TEXT[done.status]}</b> · 检查 {done.score} · {done.totalSec}s
                  </span>
                )}

                {done && <span className="slip-fold" />}
                <span className="slip-tip">
                  {done ? "打开这份方案 →" : "点一下开始编译 →"}
                </span>
              </button>
            );
          })}

          <button
            className={`slip blank${paused ? " still" : ""}`}
            style={
              {
                "--r": "-1.4deg",
                "--d": "17s",
                "--delay": "-6s",
                "--mt": "12px",
                "--z": 12,
              } as React.CSSProperties
            }
            onClick={onBlank}
          >
            写下你自己的那个为什么 →
            <span className="slip-tip">新建一条编译</span>
          </button>
        </div>
      )}
    </div>
  );
}
