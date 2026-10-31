import type { VisualStyle } from "./types";

/**
 * 视觉风格 = 可执行规格，不是形容词。
 * 每种风格锁死一套参数，差异会原样写进交接包，
 * 所以三种方案在成片层面是三种不同的东西，而不是同一段话的三种说法。
 */
export const STYLES: VisualStyle[] = [
  {
    id: "evidentiary",
    name: "影像实证型",
    tagline: "用真实影像做证据，让概念自己显形",
    baseMedium: "真实医学影像 / 公开 DICOM 数据集 / 显微与宏观摄影",
    palette: [
      { name: "墨黑", hex: "#0E1116", role: "背景与负空间" },
      { name: "骨白", hex: "#E8E4DC", role: "主体与文字" },
      { name: "朱红", hex: "#C8102E", role: "唯一强调色，标记关键结构" },
    ],
    camera: "缓推为主，机位固定，禁止快速摇移；关键结构用 5% 缩放幅度做揭示",
    transition: "直接切换 / 极短黑场（≤4 帧），不用任何溶解与特效",
    typography: "思源宋体，字重 400，字号克制，仅左下角单行",
    texture: "保留影像原始噪点，不降噪、不磨皮，允许轻微扫描线",
    negative: "禁用卡通插画、禁用彩色渐变、禁用发光特效、禁用 3D 渲染质感",
    bestFor: "有真实影像支撑的概念：弛豫、k 空间、PET 代谢、伪影",
    paceSec: 4.2,
  },
  {
    id: "diagram",
    name: "图解极简型",
    tagline: "把机制拆成可逐层绘制的几何关系",
    baseMedium: "白底线稿 / 几何图形 / 矢量图示",
    palette: [
      { name: "纸白", hex: "#FAFAF7", role: "背景" },
      { name: "石墨", hex: "#1A1A1A", role: "线条与文字" },
      { name: "钴蓝", hex: "#2F6FED", role: "强调色，只标注变量" },
    ],
    camera: "完全固定机位，靠元素绘制顺序推进，不用运镜",
    transition: "图形连续变形（morph），上一镜的元素成为下一镜的起点",
    typography: "思源黑体，字重 500，居中或右侧对齐，允许出现公式",
    texture: "纯平涂，无纹理无阴影，背景留白不少于 40%",
    negative: "禁用摄影素材、禁用真实影像、禁用装饰性插画、禁用渐变",
    bestFor: "有明确因果链与量化关系的概念：MIC、期望值、剂量换算",
    paceSec: 3.0,
  },
  {
    id: "metaphor",
    name: "具象隐喻型",
    tagline: "先给一个能摸到的东西，再把它换成概念",
    baseMedium: "微距实物 / 流体 / 材质特写（沙、水、黏土、金属）",
    palette: [
      { name: "深褐", hex: "#12100E", role: "背景" },
      { name: "橙焰", hex: "#FF6B35", role: "主体与运动" },
      { name: "暖沙", hex: "#F7C59F", role: "辅助与过渡" },
    ],
    camera: "跟随运动，浅景深，允许手持微颤，允许一次快速推近",
    transition: "物态连续：同一材质从一镜延续到下一镜，动作不中断",
    typography: "手写体（仅片头片尾），正文用手写体以外的无衬线，字号偏大",
    texture: "保留真实材质颗粒与轻微失焦，允许出现指纹、水渍、灰尘",
    negative: "禁用屏幕录制感、禁用扁平矢量图、禁用医疗影像素材",
    bestFor: "有情绪张力或认知偏差的概念：损失厌恶、沉没成本、熬夜",
    paceSec: 2.6,
  },
];

export function getStyle(id: string): VisualStyle {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}
