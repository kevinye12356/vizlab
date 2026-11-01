# VIZLAB 前端交付说明（给 Kimi）

一个 Next.js + React + 纯 CSS 的单页交互应用：用户输入一句科普疑问 → 实时识别「条件 / 现象」→
播放一段「编译」转场 → 得到抽象概念图、分镜、可执行提示词。

请先读第 4 节（转场）和第 5 节（不要动的部分），再动代码。

---

## 1. 怎么跑起来

```bash
npm install
npm run dev        # http://localhost:3000
```

**不需要任何 API Key 也能完整跑通**：种子库里已有的问题直接出结果，不调模型（`data/questions.json`）。
只有问种子库以外的问题，才需要 `cp .env.example .env.local` 并填 `DEEPSEEK_API_KEY`。
换句话说：**你改界面时不用管后端，它自己会返回数据。**

技术栈：Next.js 16.4 · React 19.3 · TypeScript 5 · **手写 CSS，没有 Tailwind、没有 UI 库、没有动画库**。

---

## 2. 代码在哪里

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `src/app/glass.css` | ~1120 | **全站唯一视觉层**：设计令牌 + 玻璃系统 + 转场动画 + 响应式 |
| `src/components/GlassLab.tsx` | ~2200 | 页面全部逻辑与 JSX（首页 / 转场 / 错误页 / 结果页四态） |
| `src/app/layout.tsx` | 28 | 只做两件事：`import "./glass.css"`、挂 Google Fonts 外链 |
| `src/app/page.tsx` | 9 | 只渲染 `<GlassLab />` |
| `src/lib/**` | — | 类型、模型调用、分镜推导、audit、adapter。**界面改动不需要碰** |
| `src/app/api/**` | — | 6 个路由。**接口契约见第 5 节** |

### 请直接忽略的文件（上一代产品的死代码，未挂载）

`src/app/globals.css`、`desk.css`、`landing.css`、`orb.css`，
`src/components/DeskHome.tsx`、`Landing.tsx`、`MorphOrb.tsx`、`PaperHome.tsx`、
`ProjectDetail.tsx`、`GraphView.tsx`、`AudiencePanel.tsx`。

它们没有被任何入口 import。**不要基于它们改样式，也不要把它们 import 回来**，
否则会和 `glass.css` 的令牌体系打架。（顺手删掉是允许的，见第 8 节。）

---

## 3. 设计规范（改任何视觉都按这个来）

| 用途 | 值 | 约束 |
| --- | --- | --- |
| 底色 | `#070B14`（深一级 `#05080F`） | 不要改成纯黑或蓝紫渐变 |
| 主文字 | `#E8EEF7` | — |
| 次级文字 | `rgba(232,238,247,.72)` | 不低于 0.72 |
| 三级文字 | `rgba(232,238,247,.68)` | 不低于 0.68；**再往下的层级用字号/字重/字距表达，不要继续降透明度** |
| 主强调（冷青） | `#5CE1E6` | 交互态、当前状态、因果链 |
| 终点色（琥珀） | `#FFB86B` | **只允许出现在两处：编译按钮、结果终点**。别处一概不用 |
| 毛玻璃 | `backdrop-filter: blur(24px) saturate(160%)` | 全站**只有 3 块**：输入台 `.gl-desk`、结果顶栏 `.gl-topbar`、概念图 `.gl-graph`。加第 4 块会明显掉帧 |
| 圆角 | `--r-xl: 24px` | 大块用 24，控件 12，胶囊 999 |
| 缓动 | `cubic-bezier(.16,1,.3,1)` | 位移一律用它；不要用 ease-in-out |
| 字号 | 只有 5 档：11 / 13 / 15 / 21 / `clamp(26px,4.2vw,46px)` | 新增字号会被判为层级混乱 |
| 左右边距 | `--gutter-x`（40 / 20 / 18） | 导航、hero、输入台、结果页共用同一个值，不要各自写死 |

性能红线：这个项目曾经因为 25 个 `backdrop-filter` + 3 团 `filter: blur(90px)` 掉到 20fps。
**不要给大面积元素加 `filter`，不要在毛玻璃里再套毛玻璃。** 位移优先 `transform`，不要动 `margin/top`。

---

## 4. 转场（最重要的一段，改它之前必须读完）

转场不是特效序列，是「产品正在做什么」的现场演示。四拍：

| 拍 | 窗口 | 在演什么 | 类名 |
| --- | --- | --- | --- |
| 1 定睛 | 400ms | 扫描用户那句话，标出条件/现象 | `is-scan` |
| 2 拆解 | 1000ms | 句子拆成 4 个槽位，中间两格空着 | `is-split` |
| 3 补链 | 800ms（**等 `/api/compile` 返回**，真实 6–7s） | 空槽呼吸，AI 在补中间环节 | `is-recombine` |
| 4 落定 | 420ms | 概念名归位 | `is-unfold` |

硬约束：**每一段动画的「延迟 + 时长」必须 ≤ 它所在那一拍的窗口。**
超出去的动画不会报错，只会「看起来这一段没动」——这个坑已经踩过一次。
第三拍的连线/节点动画全部压在 800ms 内（延迟 0 / 200 / 400 配合 380ms 时长）。

两条容易改坏的地方：

1. **token 起点是测量出来的**，不是写死的坐标。`useLayoutEffect` 量出「你的词」在原句里的位置，
   换算成 `--fx / --fy` 注入。改成固定坐标的话，词会从画面另一侧凭空出现。
2. **动效固定全量播放，没有简化模式。** 上一版有「完整 / 简化」开关 + `prefers-reduced-motion`
   自动降级，导致用户开着「减少动态效果」时看不到全部演示，已整体删除。
   **不要加回这两者中的任何一个。**

---

## 5. 不要动的部分（后端契约）

界面怎么改都行，但这几条改了就断：

- `POST /api/compile`
  入参 `{ question, durationTargetSec }`
  出参 `{ graph, storyboard, audit, engine, model, handoff }`
  失败 `422 { ok:false, code, message, suggestions }`，`code` 为 `NOT_COVERED` / `MODEL_FAILED`
- `POST /api/audience` → `{ report: { probes: [{ shotIndex, comprehension, ... }] } }`（shotIndex 从 0 起）
- `src/lib/types.ts` 里的 `ConceptGraph / CompileView / Storyboard` 结构
- 概念图拖拽的语义是**「详略权重」**（3 重点展开 / 2 均分 / 1 简讲），它联动分镜时长与提示词里的【详略】段落。
  **不要改成自由摆放位置**——因果链是 AI 的判断，不该让用户改；用户改的是「这一环讲多少」。

---

## 6. 可以自由发挥的地方

- 首屏层级与留白（当前 hero → 输入台 48px，输入台 → 选项条 20px）
- 结果页三段（概念图 / 分镜 + 时间轴 / 提示词块）的版式密度
- 移动端 390 的折叠方式（<960px 时概念图降级为竖列，连线改用 CSS 伪元素画）
- 转场里的视觉细节（在四拍窗口与 3 块毛玻璃的前提下随便美化）

---

## 7. 验收清单

```bash
npm run build     # 必须通过（tsc 严格）
```

- 1440 与 390 两个宽度都**没有横向滚动条**
- 转场四拍能连着演完，不出现「第三拍什么都没动」
- 刷新页面后动效不会消失
- 结果页三个区块之间没有元素重叠（`getBoundingClientRect` 自查）

---

## 8. 已知待办（你可以顺手做掉）

1. 删死代码：上面第 2 节点名的 4 个 CSS + 7 个旧组件，约 6600 行，删掉不影响任何视觉。
2. `GlassLab.tsx` 2200 行拆成 6–8 个文件（转场 / 概念图 / 分镜 / 提示词 / hooks）。
   纯重构，**拆分前后逐像素应完全一致**。
3. 中文字体自托管：现在走 Google Fonts 外链，国内加载慢甚至失败，建议换成 `next/font` 本地子集。
