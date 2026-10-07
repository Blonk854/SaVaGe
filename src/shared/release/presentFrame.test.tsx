import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DropZone } from "../../features/converter/DropZone";
import {
  decideOpenImagePresent,
  NO_PRESENTATION_TIME,
  OPEN_IMAGE_PRESENT_ID,
  PRESENT_ORIGIN_MIN_MS,
  sampleFromElementTimingEntry,
  stampOpenImagePresent,
  watchOpenImagePresent,
  type PresentTimingSample,
} from "./presentFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = Date.UTC(2026, 0, 1);

function sample(overrides: Partial<PresentTimingSample> = {}): PresentTimingSample {
  return {
    identifier: OPEN_IMAGE_PRESENT_ID,
    timeOriginUnixMs: ORIGIN,
    paintTimeMs: 12,
    presentationTimeMs: 18,
    renderTimeMs: 18,
    ...overrides,
  };
}

describe("WebView2 present time for Open Image", () => {
  it("stamps presentationTime and ignores paint or render fallbacks", () => {
    const stamped = stampOpenImagePresent(sample());
    expect(stamped?.presentationTimeMs).toBe(18);
    expect(stamped?.presentedUnixMs).toBe(ORIGIN + 18);
    expect(stampOpenImagePresent(sample({ presentationTimeMs: null, renderTimeMs: 40 }))).toBeNull();
    expect(stampOpenImagePresent(sample({ presentationTimeMs: 0, renderTimeMs: 40 }))).toBeNull();
    expect(stampOpenImagePresent(sample({ presentationTimeMs: Number.NaN }))).toBeNull();
    expect(stampOpenImagePresent(sample({ presentationTimeMs: 120_001 }))).toBeNull();
    expect(stampOpenImagePresent(sample({ identifier: "other" }))).toBeNull();
    expect(stampOpenImagePresent(sample({ timeOriginUnixMs: PRESENT_ORIGIN_MIN_MS - 1 }))).toBeNull();
    expect(stampOpenImagePresent(sample({ paintTimeMs: -1 }))).toBeNull();
  });

  it("reads the element id without treating renderTime as presentationTime", () => {
    const fromIdentifier = sampleFromElementTimingEntry(
      { identifier: OPEN_IMAGE_PRESENT_ID, renderTime: 40, paintTime: 9 },
      ORIGIN,
    );
    expect(fromIdentifier.presentationTimeMs).toBeNull();
    expect(fromIdentifier.renderTimeMs).toBe(40);
    expect(decideOpenImagePresent([fromIdentifier])).toEqual({
      kind: "unavailable",
      code: NO_PRESENTATION_TIME,
      sample: fromIdentifier,
    });
    const fromName = sampleFromElementTimingEntry({ name: "other", presentationTime: 4 }, ORIGIN);
    expect(decideOpenImagePresent([fromName])).toEqual({ kind: "wait" });
  });

  it("reports the first presented frame and stops", () => {
    const reports: string[] = [];
    let stopCount = 0;
    watchOpenImagePresent(
      (onEntries) => {
        onEntries([sample({ identifier: "chrome" })]);
        onEntries([sample({ presentationTimeMs: 22 })]);
        onEntries([sample({ presentationTimeMs: 80 })]);
        return () => {
          stopCount += 1;
        };
      },
      (decision) => {
        reports.push(decision.kind === "presented" ? String(decision.stamp.presentationTimeMs) : decision.kind);
      },
    );
    expect(reports).toEqual(["22"]);
    expect(stopCount).toBe(1);
  });

  it("reports a missing presentation timestamp once", () => {
    const reports: string[] = [];
    watchOpenImagePresent(
      (onEntries) => {
        onEntries([sample({ presentationTimeMs: null, renderTimeMs: 30 })]);
        onEntries([sample({ presentationTimeMs: 10 })]);
        return () => {};
      },
      (decision) => reports.push(decision.kind),
    );
    expect(reports).toEqual(["unavailable"]);
  });
});

describe("Open Image present marker", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it("marks the Open Image label for element timing", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<DropZone onFile={() => {}} onReject={() => {}} />);
    });
    const marked = host.querySelector(`[elementtiming="${OPEN_IMAGE_PRESENT_ID}"]`);
    expect(marked?.textContent).toBe("Drop an image to vectorize");
    expect(marked?.closest("button")).toBeNull();
    expect(host.querySelector("button")?.textContent?.startsWith("Open Image…")).toBe(true);
  });
});
