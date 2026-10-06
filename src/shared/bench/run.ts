import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, hostname, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setZoomCentered } from "../../features/editor/camera";
import { drawDocument, drawGrid, drawOverlays } from "../../features/editor/renderer/drawDocument";
import { parseSavageDocument } from "../document/parseSavage";
import { documentToSvgString } from "../document/serialize";
import { hitTestTopNode } from "../geometry/hitTest";
import { applyMat, nodeWorldMatrix } from "../geometry/transform";
import { useUiStore } from "../stores/uiStore";
import { recordingContext } from "./canvasStub";
import {
  summarizeSamples,
  versusPlan,
  type BenchmarkReport,
  type StandardMetric,
  type TimingSummary,
} from "./compare";
import {
  BENCHMARK_PATH_COUNTS,
  STANDARD_FIXTURE,
  benchmarkFixtureName,
  createBenchmarkDocument,
  FIXTURE_VERSION,
  type BenchmarkPathCount,
} from "./corpus";

const VIEW_W = 1440;
const VIEW_H = 900;

function paint(
  ctx: CanvasRenderingContext2D,
  doc: ReturnType<typeof createBenchmarkDocument>,
  zoom: number,
  panX: number,
  panY: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#0B0D10";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawGrid(ctx, VIEW_W, VIEW_H, zoom, panX, panY);
  drawDocument(ctx, doc, zoom, panX, panY);
  drawOverlays(ctx, zoom, panX, panY, null);
}

function measure(warmup: number, iterations: number, fn: () => void): TimingSummary {
  for (let i = 0; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  return summarizeSamples(samples);
}

function measurePoints(
  ctx: CanvasRenderingContext2D,
  doc: ReturnType<typeof createBenchmarkDocument>,
  warmup: { x: number; y: number }[],
  points: { x: number; y: number }[],
): TimingSummary {
  for (const point of warmup) hitTestTopNode(ctx, doc, point.x, point.y, 1);
  const samples: number[] = [];
  for (const point of points) {
    const started = performance.now();
    hitTestTopNode(ctx, doc, point.x, point.y, 1);
    samples.push(performance.now() - started);
  }
  return summarizeSamples(samples);
}

function hitPoints(doc: ReturnType<typeof createBenchmarkDocument>, count: number) {
  const ids = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.type === "path");
  const step = Math.max(1, Math.floor(ids.length / count));
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < ids.length && points.length < count; index += step) {
    const world = nodeWorldMatrix(doc, ids[index]);
    if (!world) continue;
    points.push(applyMat(world, 10, 10));
  }
  return points;
}

function missPoints(count: number) {
  return Array.from({ length: count }, (_, index) => ({ x: -200 - index, y: -200 - index }));
}

function machineInfo(): BenchmarkReport["machine"] {
  const cpu = cpus()[0];
  const info: BenchmarkReport["machine"] = {
    name: hostname(),
    os: `${platform()} ${release()}`,
    cpu: cpu?.model?.trim() || "unknown",
    logicalProcessors: cpus().length,
    memoryBytes: totalmem(),
    gpu: null,
    webView2: null,
    dpi: null,
    node: process.version,
  };
  if (platform() !== "win32") return info;
  try {
    const script = [
      "$gpu = @(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ', '",
      "$wv = $null",
      "$keys = @(",
      "  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',",
      "  'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'",
      ")",
      "foreach ($key in $keys) {",
      "  $item = Get-ItemProperty -ErrorAction SilentlyContinue $key",
      "  if ($item.pv) { $wv = [string]$item.pv; break }",
      "}",
      "$dpi = (Get-ItemProperty -ErrorAction SilentlyContinue 'HKCU:\\Control Panel\\Desktop\\WindowMetrics').AppliedDPI",
      "Write-Output (($gpu -replace '[\\r\\n|]', ' ') + '|' + $wv + '|' + $dpi)",
    ].join("\n");
    const output = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", script],
      { encoding: "utf8", timeout: 20_000 },
    ).trim();
    const [gpu, webView2, dpi] = output.split("|");
    info.gpu = gpu || null;
    info.webView2 = webView2 && webView2 !== "null" ? webView2 : null;
    const parsedDpi = Number(dpi);
    info.dpi = Number.isFinite(parsedDpi) && parsedDpi > 0 ? parsedDpi : null;
  } catch {
    // Machine identity still records CPU and memory when WMI is unavailable.
  }
  return info;
}

function measureFixture(pathCount: BenchmarkPathCount, full: boolean) {
  const doc = createBenchmarkDocument(pathCount);
  const text = JSON.stringify(doc);
  const ctx = recordingContext();
  const iterations = full ? 8 : 3;
  const heavy = pathCount >= 10_000;
  const frames = full ? 16 : heavy ? 2 : 4;
  const probes = full ? 24 : heavy ? 1 : 8;
  const hits = hitPoints(doc, probes);
  const misses = missPoints(probes);
  const dir = mkdtempSync(join(tmpdir(), "savage-bench-"));
  const file = join(dir, `${benchmarkFixtureName(pathCount)}.savage`);
  try {
    writeFileSync(file, text);
    useUiStore.getState().setZoom(1);
    useUiStore.getState().setPan(0, 0);
    const panSamples: number[] = [];
    for (let i = 0; i < frames + 1; i++) {
      const started = performance.now();
      if (i % 2 === 0) setZoomCentered(0.35 + (i % 6) * 0.2, VIEW_W, VIEW_H);
      else {
        const ui = useUiStore.getState();
        ui.setPan(ui.panX - 24, ui.panY - 16);
      }
      const ui = useUiStore.getState();
      paint(ctx, doc, ui.zoom, ui.panX, ui.panY);
      if (i > 0) panSamples.push(performance.now() - started);
    }
    return {
      importParse: measure(1, iterations, () => {
        parseSavageDocument(text);
      }),
      renderFrame: measure(1, frames, () => {
        paint(ctx, doc, 1, 40, 40);
      }),
      panZoomFrame: summarizeSamples(panSamples),
      hitTestHit: measurePoints(ctx, doc, heavy ? [] : hits.slice(0, 1), hits),
      hitTestMiss: measurePoints(ctx, doc, heavy ? [] : misses.slice(0, 1), misses),
      save: measure(1, iterations, () => {
        writeFileSync(file, JSON.stringify(doc));
      }),
      reopen: measure(1, iterations, () => {
        parseSavageDocument(readFileSync(file, "utf8"));
      }),
      exportSvg: measure(1, iterations, () => {
        documentToSvgString(doc);
      }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readStartupSample(path: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { editorModuleEvalMs?: unknown };
    return typeof parsed.editorModuleEvalMs === "number" ? parsed.editorModuleEvalMs : null;
  } catch {
    return null;
  }
}

export function runBenchmark(startupPath: string): BenchmarkReport {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = () => null;
  }
  const byFixture: Record<string, Record<StandardMetric, TimingSummary>> = {};
  for (const pathCount of BENCHMARK_PATH_COUNTS) {
    const name = benchmarkFixtureName(pathCount);
    byFixture[name] = measureFixture(pathCount, name === STANDARD_FIXTURE);
  }
  const startup = {
    editorModuleEvalMs: readStartupSample(startupPath),
    windowMs: null as null,
  };
  const metrics = byFixture[STANDARD_FIXTURE];
  const otherFixtures = Object.fromEntries(
    Object.entries(byFixture).filter(([name]) => name !== STANDARD_FIXTURE),
  );
  return {
    fixtureVersion: FIXTURE_VERSION,
    standardFixture: STANDARD_FIXTURE,
    buildMode: "vitest-jsdom-cpu",
    conditions: "warm",
    machine: machineInfo(),
    startup,
    metrics,
    versusPlan: versusPlan(metrics, startup),
    otherFixtures,
  };
}
