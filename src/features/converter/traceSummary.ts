import type { ConvertOptions } from "./convertApi";
import { formatBytes, type ImagePreview } from "./rasterFiles";

const SHAPE_TAG = /<(?:path|rect|circle|ellipse|polygon|polyline|line)\b/gi;
const LAST_OPTIONS_KEY = "savage.convert.lastOptions";

export const COMPLEX_SHAPE_LIMIT = 1500;
export const COMPLEX_BYTE_LIMIT = 750_000;
export const SOURCE_CAUTION_DIMENSION = 4096;
export const SOURCE_CAUTION_PIXELS = 8_000_000;
export const SOURCE_CAUTION_BYTES = 16 * 1024 * 1024;

export interface TraceSummary {
  shapeCount: number;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number;
}

type OptionStorage = Pick<Storage, "getItem" | "setItem">;

export function countTraceShapes(svg: string): number {
  return svg.match(SHAPE_TAG)?.length ?? 0;
}

export function traceDimensions(svg: string): { width: number; height: number } | null {
  const open = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!open) return null;
  const width = lengthAttr(open, "width");
  const height = lengthAttr(open, "height");
  if (width !== null && height !== null) return { width, height };
  const viewBox = open.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  if (parts[2] <= 0 || parts[3] <= 0) return null;
  return { width: parts[2], height: parts[3] };
}

export function summarizeTrace(svg: string, durationMs: number): TraceSummary {
  const dimensions = traceDimensions(svg);
  return {
    shapeCount: countTraceShapes(svg),
    byteSize: new TextEncoder().encode(svg).length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTraceSummary(summary: TraceSummary): string {
  const size =
    summary.width !== null && summary.height !== null
      ? `${Math.round(summary.width)}×${Math.round(summary.height)} · `
      : "";
  const shapes = summary.shapeCount === 1 ? "1 shape" : `${summary.shapeCount.toLocaleString()} shapes`;
  return `${size}${shapes} · ${formatBytes(summary.byteSize)} · ${formatDuration(summary.durationMs)}`;
}

export function complexityWarning(summary: Pick<TraceSummary, "shapeCount" | "byteSize">): string | null {
  if (summary.shapeCount >= COMPLEX_SHAPE_LIMIT) {
    return `This trace has ${summary.shapeCount.toLocaleString()} shapes. Raise Filter speckle or lower Color precision, then convert again.`;
  }
  if (summary.byteSize >= COMPLEX_BYTE_LIMIT) {
    return `This SVG is ${formatBytes(summary.byteSize)}. Simplify the trace before opening it in the editor.`;
  }
  return null;
}

export function sourceCaution(
  preview: Pick<ImagePreview, "width" | "height" | "byteSize">,
): string | null {
  const reasons: string[] = [];
  if (preview.width >= SOURCE_CAUTION_DIMENSION || preview.height >= SOURCE_CAUTION_DIMENSION) {
    reasons.push(`${preview.width}×${preview.height}`);
  } else if (preview.width * preview.height >= SOURCE_CAUTION_PIXELS) {
    reasons.push(`${(preview.width * preview.height).toLocaleString()} pixels`);
  }
  if (preview.byteSize >= SOURCE_CAUTION_BYTES) reasons.push(formatBytes(preview.byteSize));
  if (!reasons.length) return null;
  return `${reasons.join(" · ")} will trace slowly. The limits are 16,384 pixels per side, 40 million pixels, and 64 MB.`;
}

export function parseStoredConvertOptions(raw: string | null): ConvertOptions | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const numbers = [
    "color_precision",
    "filter_speckle",
    "splice_threshold",
    "corner_threshold",
    "path_precision",
    "layer_difference",
  ] as const;
  const options = {} as ConvertOptions;
  for (const key of numbers) {
    const number = record[key];
    if (typeof number !== "number" || !Number.isFinite(number)) return null;
    options[key] = number;
  }
  for (const key of ["mode", "hierarchical"] as const) {
    const text = record[key];
    if (typeof text !== "string" || text.length === 0 || text.length > 32) return null;
    options[key] = text;
  }
  if (record.color_mode !== undefined) {
    if (typeof record.color_mode !== "string" || record.color_mode.length > 32) return null;
    options.color_mode = record.color_mode;
  }
  if (record.max_dimension !== undefined) {
    if (typeof record.max_dimension !== "number" || !Number.isFinite(record.max_dimension)) return null;
    options.max_dimension = record.max_dimension;
  }
  return options;
}

export function readLastConvertOptions(storage: OptionStorage | null = browserStorage()): ConvertOptions | null {
  if (!storage) return null;
  return parseStoredConvertOptions(storage.getItem(LAST_OPTIONS_KEY));
}

export function writeLastConvertOptions(options: ConvertOptions, storage: OptionStorage | null = browserStorage()) {
  storage?.setItem(LAST_OPTIONS_KEY, JSON.stringify(options));
}

export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function lengthAttr(tag: string, name: string): number | null {
  const raw = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.trim();
  if (!raw || !/^\d+(?:\.\d+)?(?:px)?$/i.test(raw)) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
