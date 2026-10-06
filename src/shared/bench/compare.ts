import { FIXTURE_VERSION, STANDARD_FIXTURE } from "./corpus";

/** Provisional plan targets from savage_upgrade.md success metrics. */
export const PLAN_FRAME_MS = 1000 / 60;
export const PLAN_HIT_MS = 16;
export const PLAN_STARTUP_WINDOW_MS = 2_000;
export const REGRESSION_ALLOWANCE = 0.25;

export const STANDARD_METRICS = [
  "importParse",
  "renderFrame",
  "panZoomFrame",
  "hitTestHit",
  "hitTestMiss",
  "save",
  "reopen",
  "exportSvg",
] as const;

export type StandardMetric = (typeof STANDARD_METRICS)[number];

export interface TimingSummary {
  p50: number;
  p95: number;
}

export type VersusPlan =
  | "within-provisional-target"
  | "above-provisional-target"
  | "not-measured";

export interface BenchmarkReport {
  fixtureVersion: number;
  standardFixture: string;
  buildMode: "vitest-jsdom-cpu";
  conditions: "warm";
  machine: {
    name: string;
    os: string;
    cpu: string;
    logicalProcessors: number;
    memoryBytes: number;
    gpu: string | null;
    webView2: string | null;
    dpi: number | null;
    node: string;
  };
  startup: {
    editorModuleEvalMs: number | null;
    windowMs: null;
  };
  metrics: Record<StandardMetric, TimingSummary>;
  versusPlan: Record<string, VersusPlan>;
  otherFixtures: Record<string, Record<StandardMetric, TimingSummary>>;
}

export interface BenchmarkBaseline extends BenchmarkReport {
  regressionAllowance: number;
  recordedAt: string;
  notes: string[];
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) throw new Error("Cannot summarize an empty sample");
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

export function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function summarizeSamples(samples: number[]): TimingSummary {
  return {
    p50: roundMs(percentile(samples, 50)),
    p95: roundMs(percentile(samples, 95)),
  };
}

export function versusPlan(
  metrics: Record<StandardMetric, TimingSummary>,
  startup: BenchmarkReport["startup"],
): Record<string, VersusPlan> {
  const frame = (ms: number): VersusPlan =>
    ms <= PLAN_FRAME_MS ? "within-provisional-target" : "above-provisional-target";
  const hit = (ms: number): VersusPlan =>
    ms <= PLAN_HIT_MS ? "within-provisional-target" : "above-provisional-target";
  const moduleEval =
    startup.editorModuleEvalMs == null
      ? "not-measured"
      : startup.editorModuleEvalMs <= PLAN_STARTUP_WINDOW_MS
        ? "within-provisional-target"
        : "above-provisional-target";
  return {
    renderFrame: frame(metrics.renderFrame.p95),
    panZoomFrame: frame(metrics.panZoomFrame.p95),
    hitTestHit: hit(metrics.hitTestHit.p95),
    hitTestMiss: hit(metrics.hitTestMiss.p95),
    startupWindow: "not-measured",
    editorModuleEval: moduleEval,
  };
}

export function compareToBaseline(
  report: BenchmarkReport,
  baseline: BenchmarkBaseline,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (report.fixtureVersion !== baseline.fixtureVersion) {
    failures.push(
      `fixture version ${report.fixtureVersion} does not match baseline ${baseline.fixtureVersion}`,
    );
  }
  if (report.standardFixture !== STANDARD_FIXTURE || baseline.standardFixture !== STANDARD_FIXTURE) {
    failures.push(`standard fixture must be ${STANDARD_FIXTURE}`);
  }
  if (report.fixtureVersion !== FIXTURE_VERSION) {
    failures.push(`report fixture version must be ${FIXTURE_VERSION}`);
  }
  const allowance = baseline.regressionAllowance;
  if (!(allowance >= 0) || allowance > 1) {
    failures.push("regression allowance must be between 0 and 1");
  }
  for (const metric of STANDARD_METRICS) {
    const observed = report.metrics[metric]?.p95;
    const budget = baseline.metrics[metric]?.p95;
    if (observed == null || budget == null) {
      failures.push(`${metric} is missing from the report or the baseline`);
      continue;
    }
    const limit = budget * (1 + allowance);
    if (observed > limit) {
      failures.push(
        `${STANDARD_FIXTURE} ${metric} p95 ${observed} ms exceeds ${roundMs(limit)} ms (${allowance * 100}% over baseline ${budget} ms)`,
      );
    }
  }
  return { ok: failures.length === 0, failures };
}
