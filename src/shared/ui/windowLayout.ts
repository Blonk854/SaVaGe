/** Default native window, in logical CSS/DIP pixels. */
export const WINDOW_DEFAULT = { width: 1440, height: 900 } as const;

/**
 * Comfortable workspace. A 1080p display at 150% scaling still has this many
 * logical pixels.
 */
export const WINDOW_COMFORTABLE = { width: 1280, height: 720 } as const;

/**
 * Smallest supported window. 960×600 still fits a 1080p display at 200% scaling
 * (960×540 work area is tight; maximize). Keep this in sync with
 * `src-tauri/tauri.conf.json`.
 */
export const WINDOW_MIN = { width: 960, height: 600 } as const;

/** CSS widths below this stack Convert and tighten the inspector. */
export const COMPACT_LAYOUT_MAX_WIDTH = 1100;

export function isCompactLayout(cssWidth: number): boolean {
  return cssWidth > 0 && cssWidth <= COMPACT_LAYOUT_MAX_WIDTH;
}

export function canvasBackingStore(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    width: Math.max(1, Math.floor(Math.max(0, cssWidth) * dpr)),
    height: Math.max(1, Math.floor(Math.max(0, cssHeight) * dpr)),
    dpr,
  };
}

/** Resize, visual viewport, and monitor DPI changes. */
export function subscribeToDisplayMetrics(onChange: () => void): () => void {
  const onResize = () => onChange();
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);

  let media: MediaQueryList | undefined;
  const onDpr = () => {
    listenDpr();
    onChange();
  };
  const listenDpr = () => {
    media?.removeEventListener("change", onDpr);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    media.addEventListener("change", onDpr);
  };
  listenDpr();

  return () => {
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    media?.removeEventListener("change", onDpr);
  };
}
