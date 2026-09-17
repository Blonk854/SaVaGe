export interface FrameClock {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

const defaultClock: FrameClock = {
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => cancelAnimationFrame(handle),
};

/**
 * Coalesce invalidations into one animation frame. Idle: no rAF is running.
 */
export function createFrameScheduler(paint: () => void, clock: FrameClock = defaultClock) {
  let handle = 0;
  let scheduled = false;

  const tick: FrameRequestCallback = () => {
    handle = 0;
    scheduled = false;
    paint();
  };

  return {
    request() {
      if (scheduled) return;
      scheduled = true;
      handle = clock.requestAnimationFrame(tick);
    },
    cancel() {
      if (!scheduled) return;
      clock.cancelAnimationFrame(handle);
      handle = 0;
      scheduled = false;
    },
    get isScheduled() {
      return scheduled;
    },
  };
}

/** Font loads that can change canvas text metrics. */
export function subscribeToFontReadiness(onReady: () => void): () => void {
  const fonts = document.fonts;
  if (!fonts) return () => undefined;
  let cancelled = false;
  void fonts.ready.then(
    () => {
      if (!cancelled) onReady();
    },
    () => undefined,
  );
  const onDone = () => onReady();
  fonts.addEventListener?.("loadingdone", onDone);
  return () => {
    cancelled = true;
    fonts.removeEventListener?.("loadingdone", onDone);
  };
}
