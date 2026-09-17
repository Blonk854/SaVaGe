import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";

export interface ConvertOptions {
  color_precision: number;
  filter_speckle: number;
  splice_threshold: number;
  corner_threshold: number;
  path_precision: number;
  mode: string;
  hierarchical: string;
  layer_difference: number;
  max_dimension?: number;
  color_mode?: string;
}

export type ConvertPreset = "logo" | "photo" | "line" | "pixel";
export type ConvertPresetOrCustom = ConvertPreset | "custom";

const PRESET_MATCH_FIELDS = [
  "color_precision",
  "filter_speckle",
  "splice_threshold",
  "corner_threshold",
  "path_precision",
  "mode",
  "hierarchical",
  "layer_difference",
  "color_mode",
] as const;

export function sameConvertOptions(a: ConvertOptions, b: ConvertOptions): boolean {
  return PRESET_MATCH_FIELDS.every((field) => a[field] === b[field]);
}

export function matchingPreset(options: ConvertOptions): ConvertPresetOrCustom {
  for (const preset of Object.keys(PRESETS) as ConvertPreset[]) {
    if (sameConvertOptions(PRESETS[preset], options)) {
      return preset;
    }
  }
  return "custom";
}

export const PRESETS: Record<ConvertPreset, ConvertOptions> = {
  logo: {
    color_precision: 6,
    filter_speckle: 4,
    splice_threshold: 45,
    corner_threshold: 60,
    path_precision: 2,
    mode: "spline",
    hierarchical: "stacked",
    layer_difference: 16,
    color_mode: "color",
  },
  photo: {
    color_precision: 5,
    filter_speckle: 8,
    splice_threshold: 45,
    corner_threshold: 60,
    path_precision: 2,
    mode: "spline",
    hierarchical: "stacked",
    layer_difference: 16,
    color_mode: "color",
  },
  line: {
    color_precision: 1,
    filter_speckle: 4,
    splice_threshold: 45,
    corner_threshold: 60,
    path_precision: 2,
    mode: "spline",
    hierarchical: "stacked",
    layer_difference: 16,
    color_mode: "binary",
  },
  pixel: {
    color_precision: 6,
    filter_speckle: 0,
    splice_threshold: 45,
    corner_threshold: 60,
    path_precision: 0,
    mode: "pixel",
    hierarchical: "stacked",
    layer_difference: 16,
    color_mode: "color",
  },
};

export async function convertImageToSvg(
  sourceGrantId: string,
  options: ConvertOptions,
  sessionId: string,
  sourceRevision: number,
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown> = invoke,
  jobId = nanoid(),
): Promise<{ jobId: string; sessionId: string; sourceRevision: number; svg: string }> {
  const value = await invokeCommand("convert_image_to_svg", {
    request: { jobId, sessionId, sourceRevision, sourceGrantId, options },
  });
  if (
    !value ||
    typeof value !== "object" ||
    (value as { jobId?: unknown }).jobId !== jobId ||
    (value as { sessionId?: unknown }).sessionId !== sessionId ||
    (value as { sourceRevision?: unknown }).sourceRevision !== sourceRevision ||
    typeof (value as { svg?: unknown }).svg !== "string"
  ) {
    throw new Error("Native conversion returned a stale or invalid result");
  }
  return value as {
    jobId: string;
    sessionId: string;
    sourceRevision: number;
    svg: string;
  };
}

export async function cancelConvertJob(
  jobId: string,
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown> = invoke,
): Promise<{ jobId: string; state: string }> {
  const value = await invokeCommand("cancel_convert_job", { jobId });
  if (
    !value ||
    typeof value !== "object" ||
    (value as { jobId?: unknown }).jobId !== jobId ||
    (value as { state?: unknown }).state !== "cancelRequested"
  ) {
    throw new Error("Native conversion cancel did not confirm the running job");
  }
  return value as { jobId: string; state: string };
}

export function isCancelledConversion(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    if (record.code === "cancelled") return true;
    if (typeof record.message === "string" && /cancelled/i.test(record.message)) return true;
  }
  return /cancelled/i.test(error instanceof Error ? error.message : String(error));
}
