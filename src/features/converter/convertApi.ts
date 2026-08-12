import { invoke } from "@tauri-apps/api/core";

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
  path: string,
  options: ConvertOptions,
): Promise<string> {
  return invoke<string>("convert_image_to_svg", { path, options });
}
