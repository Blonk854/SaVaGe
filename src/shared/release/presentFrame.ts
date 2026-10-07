import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Element Timing id for the first usable converter frame.
 * The marker is the dropzone title. WebView2 does not emit element timing for
 * text inside a button, and that title is painted in the same frame as Open Image.
 */
export const OPEN_IMAGE_PRESENT_ID = "open-image";

/** Startup measurements above this are not a first usable frame. */
export const PRESENT_MAX_MS = 120_000;

/** Keep in sync with the Rust present-file bounds. */
export const PRESENT_ORIGIN_MIN_MS = Date.UTC(2020, 0, 1);
export const PRESENT_ORIGIN_MAX_MS = Date.UTC(2100, 0, 1);

export const NO_PRESENTATION_TIME = "no-presentation-time";

export interface PresentTimingSample {
  identifier: string;
  timeOriginUnixMs: number;
  paintTimeMs: number | null;
  presentationTimeMs: number | null;
  renderTimeMs: number | null;
}

export interface PresentFrameStamp {
  identifier: typeof OPEN_IMAGE_PRESENT_ID;
  timeOriginUnixMs: number;
  paintTimeMs: number | null;
  presentationTimeMs: number;
  presentedUnixMs: number;
}

export type PresentDecision =
  | { kind: "wait" }
  | { kind: "presented"; stamp: PresentFrameStamp }
  | {
      kind: "unavailable";
      code: typeof NO_PRESENTATION_TIME;
      sample: PresentTimingSample;
    };

interface ElementTimingLike {
  identifier?: string;
  name?: string;
  paintTime?: number;
  presentationTime?: number | null;
  renderTime?: number;
}

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function originInRange(value: number): boolean {
  return Number.isFinite(value) && value >= PRESENT_ORIGIN_MIN_MS && value < PRESENT_ORIGIN_MAX_MS;
}

function durationInRange(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= PRESENT_MAX_MS;
}

export function sampleFromElementTimingEntry(
  entry: ElementTimingLike,
  timeOriginUnixMs: number,
): PresentTimingSample {
  const identifier = entry.identifier || entry.name || "";
  return {
    identifier,
    timeOriginUnixMs,
    paintTimeMs: finiteOrNull(entry.paintTime),
    presentationTimeMs: finiteOrNull(entry.presentationTime),
    renderTimeMs: finiteOrNull(entry.renderTime),
  };
}

/** Presentation timestamp only. renderTime and paintTime are not present time. */
export function stampOpenImagePresent(sample: PresentTimingSample): PresentFrameStamp | null {
  if (sample.identifier !== OPEN_IMAGE_PRESENT_ID) return null;
  const presentation = sample.presentationTimeMs;
  if (presentation == null || presentation <= 0 || !durationInRange(presentation)) return null;
  if (sample.paintTimeMs != null && !durationInRange(sample.paintTimeMs)) return null;
  if (!originInRange(sample.timeOriginUnixMs)) return null;
  return {
    identifier: OPEN_IMAGE_PRESENT_ID,
    timeOriginUnixMs: sample.timeOriginUnixMs,
    paintTimeMs: sample.paintTimeMs,
    presentationTimeMs: presentation,
    presentedUnixMs: sample.timeOriginUnixMs + presentation,
  };
}

export function decideOpenImagePresent(entries: PresentTimingSample[]): PresentDecision {
  let missing: PresentTimingSample | null = null;
  for (const entry of entries) {
    if (entry.identifier !== OPEN_IMAGE_PRESENT_ID) continue;
    const stamp = stampOpenImagePresent(entry);
    if (stamp) return { kind: "presented", stamp };
    missing = entry;
  }
  if (missing) return { kind: "unavailable", code: NO_PRESENTATION_TIME, sample: missing };
  return { kind: "wait" };
}

export function watchOpenImagePresent(
  listen: (onEntries: (entries: PresentTimingSample[]) => void) => () => void,
  report: (decision: Exclude<PresentDecision, { kind: "wait" }>) => void,
): () => void {
  let settled = false;
  let stopListening = () => {};
  const handle = (entries: PresentTimingSample[]) => {
    if (settled) return;
    const decision = decideOpenImagePresent(entries);
    if (decision.kind === "wait") return;
    settled = true;
    stopListening();
    report(decision);
  };
  stopListening = listen(handle);
  if (settled) stopListening();
  return () => {
    settled = true;
    stopListening();
  };
}

function publishPresent(
  decision: Exclude<PresentDecision, { kind: "wait" }>,
  invokeCommand: InvokeFn,
): void {
  if (decision.kind === "presented") {
    void invokeCommand("record_open_image_present", {
      stamp: {
        identifier: decision.stamp.identifier,
        timeOriginUnixMs: decision.stamp.timeOriginUnixMs,
        paintTimeMs: decision.stamp.paintTimeMs,
        presentationTimeMs: decision.stamp.presentationTimeMs,
      },
    }).catch(() => undefined);
    return;
  }
  void invokeCommand("record_open_image_present", {
    stamp: {
      identifier: OPEN_IMAGE_PRESENT_ID,
      timeOriginUnixMs: decision.sample.timeOriginUnixMs,
      paintTimeMs: decision.sample.paintTimeMs,
      presentationTimeMs: null,
      renderTimeMs: decision.sample.renderTimeMs,
      unavailable: decision.code,
    },
  }).catch(() => undefined);
}

export function installOpenImagePresentObserver(
  report: (decision: Exclude<PresentDecision, { kind: "wait" }>) => void = (decision) => {
    if (!isTauri()) return;
    publishPresent(decision, invoke);
  },
  source: { now: () => number } = { now: () => performance.timeOrigin },
): void {
  if (typeof PerformanceObserver === "undefined") return;
  watchOpenImagePresent((onEntries) => {
    let observer: PerformanceObserver;
    try {
      observer = new PerformanceObserver((list) => {
        onEntries(
          list.getEntries().map((entry) =>
            sampleFromElementTimingEntry(entry as ElementTimingLike, source.now()),
          ),
        );
      });
      observer.observe({ type: "element", buffered: true });
    } catch {
      return () => {};
    }
    return () => observer.disconnect();
  }, report);
}
