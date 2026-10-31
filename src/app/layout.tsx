import type { Metadata } from "next";
import "./glass.css";

export const metadata: Metadata = {
  title: "VIZLAB · 玻璃实验室 — 把一句好奇，编译成一支科普视频",
  description:
    "输入一句自然语言科普问题，实时识别条件与现象，编译成抽象概念结构、8 条分镜和可执行提示词。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
