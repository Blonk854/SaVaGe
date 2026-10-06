#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readQualityGates, REPO_ROOT } from "./release-manifest.mjs";

export function benchmarkGateStatus(policy) {
  const gate = policy.gates.find((item) => item.id === "benchmarks");
  if (!gate || gate.enforcement !== "recorded") {
    throw new Error(
      "Benchmark gate must stay recorded; named-machine budgets are not a pull-request threshold",
    );
  }
  return {
    id: "benchmarks",
    enforcement: gate.enforcement,
    result: "recorded",
    baseline: "docs/engineering/benchmark-baseline.json",
    command: "pnpm bench",
    note: gate.note,
  };
}

export function writeBenchmarkStatus(root = REPO_ROOT) {
  const status = benchmarkGateStatus(readQualityGates(root));
  const benchmarkDir = join(root, "benchmark-results");
  mkdirSync(benchmarkDir, { recursive: true });
  mkdirSync(join(root, "test-results"), { recursive: true });
  const path = join(benchmarkDir, "status.json");
  writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`);
  return path;
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const path = writeBenchmarkStatus(REPO_ROOT);
    process.stdout.write(`${path}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
