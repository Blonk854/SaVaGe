use crate::vectorize::pipeline::{self, ConvertOptions};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ConvertOptionsDto {
    pub color_precision: u8,
    pub filter_speckle: u8,
    pub splice_threshold: u8,
    pub corner_threshold: u8,
    pub path_precision: u8,
    pub mode: String,
    pub hierarchical: String,
    pub layer_difference: i32,
    #[serde(default)]
    pub max_dimension: Option<u32>,
    #[serde(default)]
    pub color_mode: Option<String>,
}

#[tauri::command]
pub fn convert_image_to_svg(path: String, options: ConvertOptionsDto) -> Result<String, String> {
    let opts = ConvertOptions {
        color_precision: options.color_precision,
        filter_speckle: options.filter_speckle,
        splice_threshold: options.splice_threshold,
        corner_threshold: options.corner_threshold,
        path_precision: options.path_precision,
        mode: options.mode,
        hierarchical: options.hierarchical,
        layer_difference: options.layer_difference,
        max_dimension: options.max_dimension.unwrap_or(2048),
        color_mode: options.color_mode.unwrap_or_else(|| "color".into()),
    };
    pipeline::convert_image_path(&path, &opts)
}
