export type CompareMode = "split" | "overlay" | "wipe";

export const COMPARE_ZOOM_MIN = 1;
export const COMPARE_ZOOM_MAX = 8;

export function nextCompareZoom(zoom: number, deltaY: number): number {
  const current = Number.isFinite(zoom) ? zoom : 1;
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, current * factor));
}

export function comparePan(x: number, y: number, dx: number, dy: number) {
  return {
    x: x + (Number.isFinite(dx) ? dx : 0),
    y: y + (Number.isFinite(dy) ? dy : 0),
  };
}

export function compareMediaStyle(zoom: number, x: number, y: number): {
  transform: string;
  transformOrigin: "center center";
} {
  return {
    transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    transformOrigin: "center center",
  };
}
