import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSavageDocument } from "../document/parseSavage";
import {
  BENCHMARK_PATH_COUNTS,
  FIXTURE_VERSION,
  STANDARD_FIXTURE,
  benchmarkFixtureName,
  censusBenchmarkDocument,
  createBenchmarkDocument,
  summarizeBenchmarkDocument,
} from "./corpus";

const manifestPath = resolve(__dirname, "../../../fixtures/benchmarks/manifest.json");

describe("benchmark fixtures", () => {
  it("pins the 100, 1,000, and 10,000 path corpus", () => {
    const fixtures = Object.fromEntries(
      BENCHMARK_PATH_COUNTS.map((pathCount) => {
        const doc = createBenchmarkDocument(pathCount);
        const parsed = parseSavageDocument(JSON.stringify(doc));
        expect(censusBenchmarkDocument(parsed), benchmarkFixtureName(pathCount)).toEqual(
          censusBenchmarkDocument(doc),
        );
        expect(parsed.name).toBe(benchmarkFixtureName(pathCount));
        return [benchmarkFixtureName(pathCount), summarizeBenchmarkDocument(doc)];
      }),
    );
    const live = {
      fixtureVersion: FIXTURE_VERSION,
      standardFixture: STANDARD_FIXTURE,
      fixtures,
    };
    if (process.env.WRITE_BENCH_MANIFEST === "1") {
      mkdirSync(dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, `${JSON.stringify(live, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(live);
  }, 30_000);

  it("is invoked by pnpm bench", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../../package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.bench).toContain("--config vitest.bench.config.ts");
    expect(pkg.scripts.bench).toContain("src/shared/bench/startup.bench.ts");
    expect(pkg.scripts.bench).toContain("src/shared/bench/measure.bench.ts");
  });
});
