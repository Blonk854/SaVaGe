/**
 * Records Canvas 2D calls without a GPU. Frame times measured against this
 * context are CPU command time, not WebView2 present time.
 */
export function installPath2DPolyfill() {
  if (typeof globalThis.Path2D === "function") return;
  class Path2DPoly {
    rect() {}
    ellipse() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    closePath() {}
    addPath() {}
    arc() {}
  }
  globalThis.Path2D = Path2DPoly as unknown as typeof Path2D;
}

export function recordingContext(): CanvasRenderingContext2D {
  installPath2DPolyfill();
  const state = { alpha: 1, stack: [] as number[] };
  const gradient = { addColorStop() {} };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "globalAlpha") return state.alpha;
      if (prop === "save") {
        return () => {
          state.stack.push(state.alpha);
        };
      }
      if (prop === "restore") {
        return () => {
          state.alpha = state.stack.pop() ?? 1;
        };
      }
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "createPattern") return () => null;
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "getTransform") return () => new DOMMatrix();
      if (prop === "isPointInPath" || prop === "isPointInStroke") return () => false;
      if (typeof prop === "symbol") return undefined;
      return () => {};
    },
    set(_target, prop, value) {
      if (prop === "globalAlpha") state.alpha = Number(value);
      return true;
    },
  };
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
}
