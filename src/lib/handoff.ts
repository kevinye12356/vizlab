import { getStyle } from "./styles";
import type { ConceptGraph, HandoffManifest, Storyboard } from "./types";

/** 交接包：VIZLAB 的最终产物，不是视频，是一份可执行规格 */
export function buildHandoff(
  graph: ConceptGraph,
  storyboard: Storyboard,
): HandoffManifest {
  const style = getStyle(storyboard.styleId);

  return {
    version: "1.0",
    target: "Claude (Opus) / 其他支持图像与视频生成的多模态模型",
    model: "由执行方选择，VIZLAB 不指定、不调用",
    outputSpec: {
      aspect: "9:16",
      resolution: "1080x1920",
      fps: 30,
      totalSec: storyboard.totalSec,
    },
    styleRef: {
      id: style.id,
      name: style.name,
      palette: style.palette.map((p) => `${p.name} ${p.hex}`),
      baseMedium: style.baseMedium,
      typography: style.typography,
      negative: style.negative,
    },
    shots: storyboard.shots.map((s) => ({
      index: s.index,
      durationSec: s.durationSec,
      prompt: `${s.visual}｜主体：${s.conceptName}｜屏幕字:${s.onScreen}｜${style.texture}`,
      camera: s.camera,
      transition: s.transition,
    })),
    acceptance: [
      `总时长 ${storyboard.totalSec}s ±10%`,
      "每个镜头的画面主体与提示词一致，不出现额外主体",
      "全片只使用风格色板中的颜色，不引入新色相",
      "屏幕字与旁白术语必须与概念名一致",
      `禁用元素：${style.negative}`,
    ],
    disclaimer:
      "本文件是制作规格，不是视频。VIZLAB 不生成视频、不调用任何视频生成模型，执行由外部工具完成。",
  };
}
