import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REGRESSION_ALLOWANCE, compareToBaseline, type BenchmarkBaseline } from "./compare";
import { runBenchmark } from "./run";

const root = resolve(__dirname, "../../..");
const baselinePath = join(root, "docs/engineering/benchmark-baseline.json");

const notes = [
  "Frame and hit-test times are CPU work in Node against a non-GPU canvas. They check the provisional 60 FPS and 16 ms targets as command time, not WebView2 present time.",
  "startup.windowMs stays null inside this CPU benchmark. Packaged first-usable-window time is docs/engineering/window-timing.json. editorModuleEvalMs is a cold Vitest import of the editor modules and is not a regression gate.",
  "Save and reopen time JSON plus a temp file. They do not include the native ReplaceFileW path.",
  "Export times SVG serialization, not PNG raster export.",
  "The 10,000-path hit test is one probe. Derived matrices are not bulk-cached above 8,192 nodes, so each probe recomputes them.",
  "The enforced regression allowance applies to the standard 1,000-path fixture only. The 100-path and 10,000-path fixtures are recorded beside it.",
  "CI uploads this gate as recorded and does not fail on hardware noise. Re-run pnpm bench on the named machine.",
];

describe("reference-machine benchmark", () => {
  it(
    "measures startup, import, render, pan/zoom, hit testing, save, reopen, and export",
    () => {
      const report = runBenchmark(join(root, "benchmark-results/startup.json"));
      const latestPath = join(root, "benchmark-results/latest.json");
      mkdirSync(dirname(latestPath), { recursive: true });
      writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`);

      if (process.env.BENCH_RECORD === "1") {
        const baseline: BenchmarkBaseline = {
          ...report,
          regressionAllowance: REGRESSION_ALLOWANCE,
          recordedAt: new Date().toISOString(),
          notes,
        };
        writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
        return;
      }

      const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as BenchmarkBaseline;
      const comparison = compareToBaseline(report, baseline);
      expect(comparison.failures, comparison.failures.join("\n")).toEqual([]);
      expect(comparison.ok).toBe(true);
    },
    240_000,
  );
});
