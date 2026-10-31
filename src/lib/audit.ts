import type {
  AuditFinding,
  AuditReport,
  ConceptGraph,
  Storyboard,
} from "./types";

/**
 * 检查引擎
 * ------------------------------------------------------------------
 * 这里的每一条判定都是确定性规则，没有一次模型调用。
 * 同一份分镜跑两次，报告逐字相同——这正是它可以被当作证据的原因。
 */

/**
 * 绝对化表述。
 * 中文的「一定」有歧义：「一定会」是断言，「一定角度 / 一定的 / 一定程度」是量词。
 * 「绝对」同理（绝对值、绝对零度是术语）。所以用正则带否定前置排除，不能简单 includes。
 */
const ABSOLUTE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "一定", re: /一定(?!的|角度|程度|范围|条件|时间|距离|比例|数量|规律|量|期)/ },
  { label: "必然", re: /必然/ },
  { label: "百分百", re: /百分百|100%/ },
  { label: "绝对", re: /绝对(?!值|零度|温度|星等|误差)/ },
  { label: "彻底根治", re: /彻底根治|包治|永不复发/ },
];
const MEDICAL_REDLINE = [
  "确诊为",
  "诊断为",
  "建议服用",
  "用药方案",
  "推荐剂量",
  "每日服用",
  "可以停药",
  "治愈率",
];

function clampScore(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function runAudit(
  graph: ConceptGraph,
  storyboard: Storyboard,
): AuditReport {
  const findings: AuditFinding[] = [];
  const shots = storyboard.shots;

  // R1 时长匹配
  {
    const diff = Math.abs(storyboard.totalSec - storyboard.durationTargetSec);
    const ratio = diff / storyboard.durationTargetSec;
    const level = ratio <= 0.02 ? "pass" : ratio <= 0.1 ? "warn" : "fail";
    findings.push({
      id: "R1",
      level,
      category: "节奏",
      title: "总时长与目标时长匹配",
      detail:
        level === "pass"
          ? `成片 ${storyboard.totalSec}s，目标 ${storyboard.durationTargetSec}s，偏差 ${(ratio * 100).toFixed(1)}%。`
          : `偏差 ${(ratio * 100).toFixed(1)}%，需要重新分配镜头时长。`,
      metric: `${storyboard.totalSec}s / ${storyboard.durationTargetSec}s`,
      rule: "|实际总时长 − 目标总时长| / 目标 ≤ 2% 判通过，≤ 10% 判提醒",
    });
  }

  // R2 单镜节奏
  {
    const bad = shots.filter((s) => s.durationSec < 2 || s.durationSec > 9);
    const shortest = Math.min(...shots.map((s) => s.durationSec));
    const longest = Math.max(...shots.map((s) => s.durationSec));
    findings.push({
      id: "R2",
      level: bad.length === 0 ? "pass" : "warn",
      category: "节奏",
      title: "单镜时长落在可读区间",
      detail:
        bad.length === 0
          ? `最短 ${shortest}s，最长 ${longest}s，全部落在 2～9 秒。`
          : `有 ${bad.length} 个镜头越界：${bad.map((s) => `第${s.index + 1}镜 ${s.durationSec}s`).join("，")}。`,
      metric: `${shortest}s ~ ${longest}s`,
      rule: "单镜时长必须落在 [2s, 9s]，越界判提醒",
    });
  }

  // R3 旁白语速
  {
    const rates = shots.map((s) => ({
      index: s.index,
      rate: s.narration.length / s.durationSec,
    }));
    const over = rates.filter((r) => r.rate > 5.6);
    const under = rates.filter((r) => r.rate < 2.4);
    const level = over.length || under.length ? "warn" : "pass";
    const avgRate = rates.reduce((a, r) => a + r.rate, 0) / rates.length;
    const totalChars = shots.reduce((a, s) => a + s.narration.length, 0);
    const suggestedSec = Math.round(totalChars / 3.8);

    findings.push({
      id: "R3",
      level,
      category: "口播",
      title: "旁白语速在中文舒适区",
      detail:
        level === "pass"
          ? `平均 ${avgRate.toFixed(1)} 字/秒，读起来不赶。`
          : [
              over.length ? `过快 ${over.length} 镜（>5.6 字/秒）` : "",
              under.length ? `过慢 ${under.length} 镜（<2.4 字/秒）` : "",
              `这份脚本共 ${totalChars} 字，按 3.8 字/秒算适合 ${suggestedSec} 秒（当前 ${storyboard.totalSec} 秒）。`,
            ]
              .filter(Boolean)
              .join("；"),
      metric: `${avgRate.toFixed(1)} 字/秒`,
      rule: "中文口播舒适区 2.4～5.6 字/秒，越界判提醒；并按总字数给出建议时长",
    });
  }

  // R4 术语落地
  {
    const script = shots.map((s) => s.narration).join("");
    const screen = shots.map((s) => s.onScreen).join("");

    const byNarration = graph.nodes.filter((node) => script.includes(node.name));
    const missing = graph.nodes.filter(
      (node) => !script.includes(node.name) && !screen.includes(node.name),
    );
    const byScreenOnly = graph.nodes.length - missing.length - byNarration.length;

    findings.push({
      id: "R4",
      level: missing.length === 0 ? "pass" : missing.length === 1 ? "warn" : "fail",
      category: "内容",
      title: "每个概念都被旁白或屏幕字点名",
      detail:
        missing.length === 0
          ? `${graph.nodes.length} 个概念全部落地：旁白点出 ${byNarration.length} 个，屏幕字补齐 ${byScreenOnly} 个。`
          : `未落地：${missing.map((x) => x.name).join("、")}。观众会缺一环。`,
      metric: `${graph.nodes.length - missing.length}/${graph.nodes.length}`,
      rule: "概念名必须出现在旁白或屏幕字中；缺 1 个判提醒，缺 2 个及以上判不通过",
    });
  }

  // R5 结构保真（这条最能证明分镜是算出来的）
  {
    const pos = new Map(shots.map((s) => [s.conceptId, s.index]));
    const violated = graph.edges.filter((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (a === undefined || b === undefined) return false;
      return a >= b;
    });
    findings.push({
      id: "R5",
      level: violated.length === 0 ? "pass" : "fail",
      category: "结构",
      title: "分镜顺序满足全部因果边",
      detail:
        violated.length === 0
          ? `${graph.edges.length} 条因果边全部满足「因在果之前」。`
          : `${violated.length} 条边被倒置：${violated
              .slice(0, 3)
              .map((e) => `${e.from}→${e.to}`)
              .join("，")}。叙事会讲不通。`,
      metric: `${graph.edges.length - violated.length}/${graph.edges.length}`,
      rule: "对任意边 A→B，必须满足 index(A) < index(B)，否则判不通过",
    });
  }

  // R6 合规扫描
  {
    const text = shots.map((s) => `${s.narration}${s.onScreen}`).join("");
    const abs = ABSOLUTE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
    const med = MEDICAL_REDLINE.filter((w) => text.includes(w));
    const total = abs.length + med.length;
    findings.push({
      id: "R6",
      level: total === 0 ? "pass" : med.length ? "fail" : "warn",
      category: "合规",
      title: "未出现绝对化表述与医疗红线用语",
      detail:
        total === 0
          ? "旁白与屏幕字中未检出绝对化承诺，也未出现诊断或用药类表述。"
          : `检出：${[...abs, ...med].join("、")}。${med.length ? "医疗红线用语必须删除。" : "建议改为限定表述。"}`,
      metric: `${total} 处`,
      rule: "正则匹配绝对化词表与医疗红线词表，命中诊断/用药类直接判不通过",
    });
  }

  // R7 争议一致性
  {
    // 只挑真正过度的断言。「不是…而是」是中文科普的标准修辞，
    // 惩罚它会惩罚好的写作，所以不进这个表。
    const ASSERTIVE = ["必然", "一定会", "绝对", "百分之百", "唯一", "根本原因就是", "科学证明"];
    const hedged = Boolean(graph.hedge && graph.hedge.trim());
    const hits = hedged
      ? ASSERTIVE.filter((w) => graph.thesis.includes(w))
      : [];

    findings.push({
      id: "R7",
      level: !hedged ? "pass" : hits.length ? "warn" : "pass",
      category: "可信度",
      title: "论点强度与争议标注一致",
      detail: !hedged
        ? "本条内容未标注学术争议，论点表述与之一致。"
        : hits.length
          ? `内容已标注存在争议，但论点用了「${hits.join("、")}」这类断言。观众记住的是断言，不是限定。建议改为「常被认为是……」，或直接采用主流解释，不要把边缘假说写成结论。`
          : "内容标注了争议，论点也使用了限定表述，二者一致。",
      metric: hedged ? (hits.length ? "强度冲突" : "一致") : "无争议",
      rule:
        "若内容已标注学术争议，而论点仍使用「必然」「绝对」「科学证明」等绝对化断言，判提醒——断言会盖过限定；「不是…而是」属正常修辞，不在此列",
    });
  }

  const passed = findings.filter((f) => f.level === "pass").length;
  const warned = findings.filter((f) => f.level === "warn").length;
  const failed = findings.filter((f) => f.level === "fail").length;
  const score = clampScore(100 - warned * 8 - failed * 25);

  return {
    score,
    findings,
    passed,
    warned,
    failed,
    generatedAt: new Date().toISOString(),
  };
}
