---
target: src/components/GlassLab.tsx
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\23872\\WorkBuddy\\2026-10-30-11-22-35\\vizlab\\src\\components\\GlassLab.tsx"
target_fingerprint: "sha256:a5c2d0534b3780402a289439ec2505c9618740f755051ddd11dcdd776c50b48e"
target_path: "C:\\Users\\23872\\WorkBuddy\\2026-10-30-11-22-35\\vizlab\\src\\components\\GlassLab.tsx"
timestamp: 2026-10-31T03-56-18Z
slug: src-components-glasslab-tsx
---
# Critique — VIZLAB 主页面（`src/components/GlassLab.tsx`）

Method: dual-agent (A: impeccable-a · B: impeccable-b)
Target: `src/components/GlassLab.tsx`（承接首页 / 编译转场 / 结果页三态）
Slug: `src-components-glasslab-tsx`

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | 阶段条、「0X/03」、「编译中」齐备；但无数字映射，简化动效下只剩一行小字 |
| 2 | Match System / Real World | 3 | 「编译 / 拆句 / 重组因果链」在中文里自洽；但「抽象层级」「产出：完整方案」未定义 |
| 3 | User Control and Freedom | 1 | ~2s 转场不可跳过、不可取消；编译中无返回；回退入口只在结果页顶栏 |
| 4 | Consistency and Standards | 1 | 同为「单选」用了两套控件（抽象=radiogroup，受众/时长/产出=aria-pressed 按钮）；动效开关第二键「简化」缺前缀 |
| 5 | Error Prevention | 1 | 空输入有守卫（对）；但未收录问题不设防；「产出」控件选了不生效 |
| 6 | Recognition Rather Than Recall | 2 | 问题在顶栏回显、抽象有 hint；但节点 hover 变暗无图例，须移开视线去看滑杆下方说明 |
| 7 | Flexibility and Efficiency | 2 | Enter 提交、漂浮卡预填；但概念图无法键盘探索，无「同题重编译」 |
| 8 | Aesthetic and Minimalist Design | 3 | 克制，实测全站仅 1 个 backdrop-filter 面；但 6 张漂浮卡键盘不可达，分镜缩略图信息量低 |
| 9 | Error Recovery | 3 | 复制三级回退 +「已选中文本，请 Ctrl+C」很稳；但「问错 / 未收录」无恢复路径 |
| 10 | Help and Documentation | 1 | 无任何帮助；页脚把内部函数签名 `analyze(text) / compile(text, options)` 暴露给终端用户 |

**Total: 20 / 40 → Acceptable（区间下沿）**

---

## Design Specificity Verdict

**Start here.** 视觉语言执行得很扎实、忠于被钉死的「玻璃实验室」方向，但**构图是品类可互换的**。

**LLM assessment（A，无锚定）**：居中的玻璃输入框 + 极光背景 + 示例胶囊 + 三段式报告 —— 换成一个 AI 摘要器或任意「粘贴文本→出结果」的 SaaS 可以原样使用。真正属于本产品的只有两处：① 抽象滑杆把**同一批 8 个节点**在 具体/机制/原理 三档间原地重命名；② 虚线「缺失环节」节点（抗利尿激素）materialize 的瞬间。而因果图与分镜缩略图只是 8 块近乎相同的渐变色块 —— 「胶片」意象没有承载信息。结论：设计语言接近特异，**构图通用**；因果图 + 抽象滑杆是唯一无法被无关 SaaS 复用的元素。

**Deterministic scan（B）**：全项目 3 处命中 —— `gradient-text`(warning) ×1、`bounce-easing`(advisory) ×2。经可达性交叉核验：
- `desk.css:304` gradient-text → **死代码**（`layout.tsx` 是唯一 CSS 入口，只 `import "./glass.css"`）⇒ **误报**，不影响出片
- `desk.css:251` bounce-easing → 同上 ⇒ **误报**
- `glass.css:58` bounce-easing → **活代码**，真实消费点 `glass.css:497` 的 `.gl-node`（`--ease-spring` 用于概念节点回弹）⇒ 唯一真实命中，advisory

检测器在 `GlassLab.tsx` **内部零命中** —— 新前端本身没有 slop 模式。

**Visual overlays**：**没有可用覆盖层**。B 的注入前置检查是通过的（`document.title` 改写 + 注入 `<script>` 均成功回读），但按只读原则**未在页面内注入检测器覆盖层**，因此不声明任何用户可见 overlay 存在。本次证据全部来自 CLI 检测 + 真机测量。

---

## Overall Impression

视觉上这是我很愿意署名的作品：克制、自洽、参数都落在了该落的地方（实测全站只有 **1 个** backdrop-filter 面、琥珀色严格留给编译动作与终止节点、全流程统一缓动、代码块 tabular-nums）。**但它现在是一个会撒谎的界面** —— 任何输入都会编译出同一张抗利尿激素因果图。A 从源码推断出这一点，B 用浏览器实测独立复现：输入「为什么天空是蓝色的」点编译，得到的是「分镜 · 8 镜 · 38s」和一整套尿意机制镜头。这是整份评审最大的问题，也是**唯一必须先修的**。

**最大的单点机会**：真正的降级/拒绝路径已经在后端躺着（`lib/pipeline.ts` 的 `CompileError NOT_COVERED` + `suggestions`，`/api/compile` 已经返回 `{ok:false,code,message,suggestions}`），把这个接口接上，产品唯一的差异化（宁可说没收录也不硬编）立刻回来。

---

## What's Working

1. **抽象滑杆原地重命名同一批 8 节点** —— 把「抽象程度」变成可操作对象而非设置项，下方 hint 锚定每档含义。无同类 SaaS 有这个。
2. **虚线「缺失环节」节点 + `gl-condense` blur-in** —— 把产品主张（找出隐藏因果链）变成一个戏剧动作。价值主张被**演示**而不是被描述。
3. **在真实约束下忠实执行钉死的美学** —— 实测：body `rgb(7,11,20)`、3 团 aurora 且 `mix-blend-mode: screen`、噪点 opacity 0.05、backdrop-filter 实测仅 1 个（`.gl-desk`，`blur(24px) saturate(1.6)`），与「每屏 ≤2–3 块大毛玻璃」的规范完全一致；1440×900 与 390×844 均**无横向溢出**；控制台**零报错零警告**。

---

## Priority Issues

### [P0] 界面在「编造」——编译结果与输入无关，且完全没有未收录态
- **What**：`GlassLab.tsx:378` 的注释写着「compile(text, options) 预留接口：接入后端后此处改为 await fetch("/api/compile")」，实际上只把输入写进本地 state，图/分镜/提示词全部来自硬编码示例。任何非空问题都得到同一张抗抑郁…激素图与同一套 8 分镜。浏览器实测证实：输入「为什么天空是蓝色的」→ 结果页标题「分镜 · 8 镜 · 38s」，8 张卡片 `01·全景·3s … 08·全景·4s`，与天气毫无关系。
- **Why it matters**：产品身份就是「宁可明确拒绝也不硬编」。新界面静默编造，**摧毁了唯一的差异化与信任前提**，还会让用户拿着错误的分镜去产出错误视频。
- **Fix**：接 `/api/compile`；渲染真实的「暂未收录这条问题 · 试试这些」块，把返回的 `suggestions` 做成可点种子胶囊，输入台留在原地，编译按钮转为明确降级态。种子库命中的题目才进入现有结果页。
- **Suggested command**：`/impeccable harden`（辅 `/impeccable clarify`）

### [P1] 「产出」控件是死的
- **What**：`buildTemplate / materialize` 从不读取 `o.output`。选「仅提示词／分镜+提示词／完整方案」，产出与页面完全相同（实测三组默认值：大众 / 60s / 分镜+提示词，无论怎么改输出逐字一致）。
- **Why it matters**：一个静默无效的控件比没有控件更糟 —— 它教会用户「这个 UI 会骗人」。
- **Fix**：让区块可见性随 `output` 走（仅提示词→隐藏分镜与概念图；完整方案→增加 audit/handoff 区块）；做不到就删掉这组控件。
- **Suggested command**：`/impeccable distill`

### [P1] 对比度不达 WCAG AA
- **What**：`--ink-faint` = `rgba(232,238,247,0.34)` 在 `#070B14` 上约 **2.8:1**；`--ink-ghost`(0.2) 约 **1.7:1**。二者均低于 AA 的 4.5:1。且它们承载**真实信息**：10.5px 的 受众/时长/产出 标签、`.gl-shot__meta`、10px 的 `.gl-node__idx`（01–08）、代码文件名、placeholder。
- **Why it matters**：这是交互标签，不是装饰线。小号等宽字在此 alpha 下即使视力正常也吃力，Sam 类用户直接读不到。
- **Fix**：把 `--ink-faint` 提到 **α≈0.50**（我方独立复算：0.45→4.0:1、0.48→4.4:1、0.50→约 4.6:1，故 0.50 是基色上的安全下限）、`--ink-ghost` 提到 ≥0.42 且只留纯装饰用途。注意任一数值都要**在毛玻璃面板底色上复测**（面板比 body 亮，会再拉低一点）。
- **Suggested command**：`/impeccable colorize`（收尾 `/impeccable polish`）

### [P1] 概念图与单选组的可访问性
- **What**：`.gl-node` 是不可聚焦 `div`，上下游高亮只有 `onPointerEnter`；`role="radio"` 的抽象按钮无方向键 roving tabindex（3 个独立 tab stop）；同屏三处单选用了三种交互模式。
- **Why it matters**：Sam（读屏 + 纯键盘）**无法探索产品最核心的资产**；模式不一致抬高所有人的回忆成本。
- **Fix**：节点改真 `button`（tabIndex 0，`onFocus → setHover`），上下游关系用 `aria-describedby` 补；抽象组实现方向键导航；选项行统一到同一 radio 模式。
- **Suggested command**：`/impeccable harden`

### [P2] 交付规格自相矛盾：看到的 ≠ 复制到的
- **What**：标题写「分镜 · 8 镜 · 38s」，但时长默认 60s；代码块显示字面 `${时长}/${受众}/${抽象层级}`，复制时却被替换成实际值；8 张缩略图是无差别渐变色块，不传达「胶片」。
- **Why it matters**：一份「生产规格」的数字必须自洽，否则整个交付物都不可信。Riley 五分钟内就能定位「编译是装饰」。
- **Fix**：分镜标题由所选时长推导（或明确标注「38s 示意示例」）；内联预览显示已填充值（如 `60s` 叠一个淡 `${时长}` 幽灵）；给每张缩略图一行场景字形/排版剧照。
- **Suggested command**：`/impeccable clarify`（辅 `/impeccable shape`）

---

## Persona Red Flags

**Jordan（困惑的新手）**：落地看到极光 + 玻璃框 + 逐字轮播。输入「为什么天是蓝的？」→ `.gl-rec__hint` 仍停在「实时识别…」且**一个识别 chip 都没有**，但 `.gl-compile` 依旧可点。点下去，得到一张自信满满的尿意机制图、「分镜 · 8 镜 · 38s」，以及关于抗利尿激素的提示词。页面上**没有任何一处**告诉他工具替换了他的问题或未收录。他会判定产品坏了，或是在骗人。

**Sam（读屏 + 纯键盘）**：① 6 张漂浮卡 `tabIndex={-1}`，够不到 —— 着陆页唯一「我不知道问什么」的入口对键盘不存在；② 结果页概念图是 9 个无 role 的 `div`，按 DOM 顺序朗读（`BYPASS b1` 排在 07/08 之后，视觉上却在中部），且**无法用键盘触发上下游高亮**（只有 `onPointerEnter`）；③ 抽象 `radiogroup` 无方向键、3 个独立 tab stop；④ 同为单选，抽象走 radio、选项行走 `aria-pressed` 按钮，两套词汇；⑤ 他最需要的标签恰好是低对比的 `.gl-node__idx`（10px ≈2.8:1）与 10.5px 选项标签。

**Riley（刻意压力测试）**：输入「test」→ 正常编译 → 还是那张尿意图；空输入 Enter → 正确无反应；把时长改 90s → 提示词说 90s，但分镜标题仍死写 38s；点「产出」三个选项再复制 → 输出逐字相同；很快就能定位「编译是装饰」。

---

## Minor Observations

- **漂浮卡键盘不可达**（`tabIndex={-1}`），点击只 `setText` 不聚焦输入，<960px 直接消失 —— 建议进入 tab 序列，或补一条常驻「试试这些」胶囊行并在点击后 focus 输入框。（`/impeccable layout` 或 `/impeccable onboard`）
- **死代码与「可回退」承诺不成立**：`page.tsx` 注释称旧七步书桌流程「可随时回退」，但 `layout.tsx` 只 `import "./glass.css"`，`desk.css / globals.css / landing.css / orb.css` 与 `DeskHome / PaperHome / Landing / MorphOrb / GraphView / AudiencePanel / ProjectDetail` **全部不可达**。注意 `globals.css` 未加载 —— 一旦将来挂载会是无样式。建议删除该死树，或移到独立路由并各自 import 其 CSS，同时修正注释。（`/impeccable distill`）
- **页面标题仍是旧的「玻璃实验室」**：实测 `document.title` = 「VIZLAB · 玻璃实验室 — 把一句好奇，编译成一支科普视频」。界面上 GLASS LAB 已清干净（实测 0 处），但 metadata 里还留着，与刚才的品牌收敛不一致。
- **字体**：`layout.tsx` 把 Google Fonts `<link>` 塞在 `<body>` 内（head 里已有一次 preload），样式表被请求两次；且规格点名「Source Han Sans CN」，实际只加载了 Noto Sans SC —— 被点名的字族从未 fetch，字体栈静默回退。建议改用 `next/font`。
- **`.gl-input { color: transparent }`**：可见字形完全依赖 mirror 层。若 mirror 因 JS/水合失败或扩展干扰未渲染，用户将看不到自己输入的任何字。建议加降级。
- 编译中 `.gl-stage` 与 `.gl-rec` 两个 `aria-live="polite"` 同时更新，读屏可能听到「扫描文本… 已识别… 问题类型」的杂音。
- `backToEdit` 只重置 phase/stage（保留 `text` 是对的），但 `rec` 沿用旧值。
- 无 `<footer>`、无署名/联系方式；`.gl-code__foot` 面向开发者而非用户。
- **值得肯定的**：概念图与 `max-w:1240px` 的断点很干净（1241px 起 1160 图正好放下，≤1240 切纵向单列）。

---

## Questions to Consider

1. 如果把编译动画整个删掉，这页还能讲清产品在做什么吗？「编译器」隐喻只在动画里被**表演** —— 把全部概念模型压在一段 2 秒不可跳过的表演上，是对的吗？
2. 产品主张是诚实（「明确拒绝…不硬编」），界面却零拒绝态、每张图都相同；抽象滑杆在原地重命名 8 个固定节点 —— 这是特性，还是承认「编译」只是包装？
3. 用户复制这段提示词五分钟后拿它做什么？界面提前准备了吗（没有引擎、模型、画幅、参考帧的任何指引，页脚却在讲内部函数签名）？
4. 哪个更属于 VIZLAB：墨蓝玻璃极光，还是那个 materialize 的虚线抗利尿激素节点？如果只有后者特异，为什么占据整个视口的是前者？
5. 38s 的分镜该是固定示例还是计算产物？页面把它当「编译结果」呈现，可它每个数字都是常量 —— 当用户把时长改成 90s，分镜如果诚实地重新配时，会有什么崩掉？

---

## Run Notes（验证边界，请如实看待）

- **方法合规**：A、B 为两个相互隔离的并行子代理，A 完成先于 B 的检测器结果进入合成上下文。无降级。
- **A 的目视边界**：本会话**没有可用的浏览器自动化工具**（无 Playwright/Puppeteer/MCP browser）。A 通过 `curl` 审 SSR HTML + 读全文源码推理，**只验证了首页**（SSR 输出的是默认 `phase="landing"` 标记）。**编译转场与结果页的判断来自源码 + CSS 推理，不是 A 亲眼所见**；hover / 拖拽 / 键盘 / reduced-motion / 复制均未实测。
- **B 的真机证据**：B 用 headless Chrome（CDP 独立新标签）补上了像素与测量层 —— 三张截图 + 实测数值，并**独立复现了 P0**（驱动输入「为什么天空是蓝色的」后读出结果页内容）。A 与 B 严格隔离，故 A 从未看到这些截图；二者的收敛是靠各自的独立路径达成的。
- **未声明覆盖层**：注入前置检查虽通过，但未在页内注入检测器覆盖层，故无用户可见 overlay。
- **对比度数字的性质**：2.8:1 / 1.7:1 是由 token alpha 在 `#070B14` 上**计算**得出（我方已独立复算，结果一致），**不是像素采样值** —— B 无法获得真实像素/对比度采样器。
- **进程清理**：评审另起的 headless Chrome 已退出（9333 无监听）；预览服务 3100 是评审前就存在的用户预览，**按规则保留未停**（实测仍 HTTP 200）。
- **未测试项**：reduced-motion 实际表现、拖拽回弹、复制成功/失败两条路径、键盘全流程、真实屏幕阅读器输出。
