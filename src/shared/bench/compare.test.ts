import { describe, expect, it } from "vitest";
import {
  PLAN_FRAME_MS,
  PLAN_HIT_MS,
  PLAN_STARTUP_WINDOW_MS,
  REGRESSION_ALLOWANCE,
  compareToBaseline,
  percentile,
  versusPlan,
  type BenchmarkBaseline,
  type BenchmarkReport,
  type StandardMetric,
  type TimingSummary,
} from "./compare";

function timing(p95: number): TimingSummary {
  return { p50: p95 / 2, p95 };
}

function metrics(p95: number): Record<StandardMetric, TimingSummary> {
  return {
    importParse: timing(p95),
    renderFrame: timing(p95),
    panZoomFrame: timing(p95),
    hitTestHit: timing(p95),
    hitTestMiss: timing(p95),
    save: timing(p95),
    reopen: timing(p95),
    exportSvg: timing(p95),
  };
}

function report(p95: number): BenchmarkReport {
  const measured = metrics(p95);
  const startup = { editorModuleEvalMs: 40, windowMs: null as null };
  return {
    fixtureVersion: 1,
    standardFixture: "paths-1000",
    buildMode: "vitest-jsdom-cpu",
    conditions: "warm",
    machine: {
      name: "reference",
      os: "win32",
      cpu: "test",
      logicalProcessors: 4,
      memoryBytes: 1,
      gpu: null,
      webView2: null,
      dpi: 96,
      node: "v24.0.0",
    },
    startup,
    metrics: measured,
    versusPlan: versusPlan(measured, startup),
    otherFixtures: {},
  };
}

describe("benchmark comparison", () => {
  it("uses nearest-rank percentiles", () => {
    expect(percentile([10, 30, 20], 50)).toBe(20);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it("keeps the plan targets for frame time, hit tests, and startup", () => {
    expect(PLAN_FRAME_MS).toBeCloseTo(1000 / 60);
    expect(PLAN_HIT_MS).toBe(16);
    expect(PLAN_STARTUP_WINDOW_MS).toBe(2000);
    expect(REGRESSION_ALLOWANCE).toBe(0.25);
    const inside = versusPlan(metrics(10), { editorModuleEvalMs: 50, windowMs: null });
    expect(inside.panZoomFrame).toBe("within-provisional-target");
    expect(inside.hitTestHit).toBe("within-provisional-target");
    expect(inside.startupWindow).toBe("not-measured");
    const outside = versusPlan(metrics(40), { editorModuleEvalMs: 2_500, windowMs: null });
    expect(outside.renderFrame).toBe("above-provisional-target");
    expect(outside.hitTestMiss).toBe("above-provisional-target");
    expect(outside.editorModuleEval).toBe("above-provisional-target");
  });

  it("allows a 25% p95 regression on the standard fixture and rejects the next step", () => {
    const baseline = {
      ...report(20),
      regressionAllowance: REGRESSION_ALLOWANCE,
      recordedAt: "2026-10-06T00:00:00.000Z",
      notes: [],
    } satisfies BenchmarkBaseline;
    expect(compareToBaseline(report(25), baseline).ok).toBe(true);
    const missed = compareToBaseline(report(25.01), baseline);
    expect(missed.ok).toBe(false);
    expect(missed.failures[0]).toMatch(/importParse/);
  });
});
