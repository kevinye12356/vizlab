/**
 * 开灯 / 关灯
 *
 * 三个独立 DOM 层（灯丝闪烁 / 圆形光扩散 / 白曝光），与页面状态解耦。
 * 支持 View Transitions 时用它做擦除，否则手动在指定时刻切换页面。
 * prefers-reduced-motion 下只做 300ms 淡入淡出。
 */

interface LampOptions {
  /** 灯的位置，用于圆形扩散的原点 */
  x?: string;
  y?: string;
  /** 移动端自动缩短到约 800ms */
  mobileMaxWidth?: number;
}

function reduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function layer(className: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  return el;
}

function makeRoot(x: string, y: string): HTMLDivElement {
  const root = layer("lamp-fx");
  root.style.setProperty("--lx", x);
  root.style.setProperty("--ly", y);
  root.setAttribute("aria-hidden", "true");
  return root;
}

/** 开灯：暗色书桌 → 明亮工作台 */
export function lampOn(swap: () => void, opts: LampOptions = {}): void {
  if (typeof document === "undefined") {
    swap();
    return;
  }

  const x = opts.x ?? "20%";
  const y = opts.y ?? "12%";
  const mobile = window.innerWidth <= (opts.mobileMaxWidth ?? 760);

  if (reduced()) {
    const root = makeRoot(x, y);
    root.classList.add("simple");
    document.body.appendChild(root);
    swap();
    window.setTimeout(() => root.remove(), 340);
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };

  if (typeof doc.startViewTransition === "function") {
    const filament = layer("lamp-fx-filament");
    const exposure = layer("lamp-fx-exposure");
    const root = makeRoot(x, y);
    root.append(filament, exposure);
    document.body.appendChild(root);
    exposure.classList.add("run");

    doc.startViewTransition(() => {
      swap();
    });

    window.setTimeout(() => root.remove(), mobile ? 900 : 1700);
    return;
  }

  // 回退：手动遮罩 + 定时切换
  const root = makeRoot(x, y);
  const filament = layer("lamp-fx-filament");
  const light = layer("lamp-fx-light");
  const exposure = layer("lamp-fx-exposure");
  root.append(filament, light, exposure);
  document.body.appendChild(root);

  const spread = mobile ? 460 : 760;
  light.style.animationDuration = `${spread}ms`;
  light.classList.add("run");
  exposure.style.animationDelay = `${mobile ? 420 : 780}ms`;
  exposure.classList.add("run");

  window.setTimeout(swap, mobile ? 400 : 700);
  window.setTimeout(() => root.remove(), mobile ? 950 : 1700);
}

/** 关灯：工作台 → 夜色书桌 */
export function lampOff(swap: () => void, opts: LampOptions = {}): void {
  if (typeof document === "undefined") {
    swap();
    return;
  }

  const x = opts.x ?? "20%";
  const y = opts.y ?? "12%";

  if (reduced()) {
    const root = makeRoot(x, y);
    root.classList.add("simple", "reverse");
    document.body.appendChild(root);
    swap();
    window.setTimeout(() => root.remove(), 340);
    return;
  }

  const root = makeRoot(x, y);
  const light = layer("lamp-fx-light");
  light.classList.add("reverse");
  root.appendChild(light);
  document.body.appendChild(root);

  const mobile = window.innerWidth <= (opts.mobileMaxWidth ?? 760);
  light.style.animationDuration = `${mobile ? 420 : 700}ms`;
  window.setTimeout(swap, mobile ? 380 : 640);
  window.setTimeout(() => root.remove(), mobile ? 800 : 1100);
}
