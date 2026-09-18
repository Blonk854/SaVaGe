use image::imageops::FilterType;
use image::GenericImageView;
use std::path::Path;
use visioncortex::PathSimplifyMode;
use vtracer::{ColorImage, ColorMode, Config, Hierarchical};

/// RGBA bytes handed to vtracer. Matches the 4096 max convert dimension on each side.
pub const MAX_TRACE_RGBA_BYTES: usize = 16_777_216 * 4;

fn ensure_trace_rgba_bound(width: u32, height: u32) -> Result<(), String> {
    let bytes = u64::from(width)
        .saturating_mul(u64::from(height))
        .saturating_mul(4);
    if bytes > MAX_TRACE_RGBA_BYTES as u64 {
        Err(format!(
            "Trace buffer is {bytes} bytes; limit is {MAX_TRACE_RGBA_BYTES}"
        ))
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct ConvertOptions {
    pub color_precision: u8,
    pub filter_speckle: u8,
    pub splice_threshold: u8,
    pub corner_threshold: u8,
    pub path_precision: u8,
    pub mode: String,
    pub hierarchical: String,
    pub layer_difference: i32,
    pub max_dimension: u32,
    pub color_mode: String,
}

pub fn convert_image_path_with_checkpoints(
    path: &Path,
    options: &ConvertOptions,
    mut checkpoint: impl FnMut(&'static str) -> Result<(), String>,
) -> Result<String, String> {
    checkpoint("decode")?;
    let img = image::open(path).map_err(|e| format!("Failed to open image: {e}"))?;
    checkpoint("resize")?;
    let (w, h) = img.dimensions();
    let longest = w.max(h);
    let img = if longest > options.max_dimension {
        let scale = options.max_dimension as f32 / longest as f32;
        let nw = ((w as f32) * scale).round().max(1.0) as u32;
        let nh = ((h as f32) * scale).round().max(1.0) as u32;
        img.resize(nw, nh, FilterType::Triangle)
    } else {
        img
    };

    checkpoint("trace")?;
    let (width, height) = img.dimensions();
    ensure_trace_rgba_bound(width, height)?;
    let rgba = img.to_rgba8();
    let (width, height) = (rgba.width() as usize, rgba.height() as usize);
    let color_image = ColorImage {
        pixels: rgba.into_raw(),
        width,
        height,
    };

    let config = options_to_config(options);
    let svg = vtracer::convert(color_image, config)?;
    checkpoint("output")?;
    Ok(format!("{svg}"))
}

fn options_to_config(options: &ConvertOptions) -> Config {
    let mode = match options.mode.to_lowercase().as_str() {
        "polygon" => PathSimplifyMode::Polygon,
        "pixel" => PathSimplifyMode::None,
        _ => PathSimplifyMode::Spline,
    };
    let hierarchical = match options.hierarchical.to_lowercase().as_str() {
        "cutout" => Hierarchical::Cutout,
        _ => Hierarchical::Stacked,
    };
    let color_mode = match options.color_mode.to_lowercase().as_str() {
        "binary" => ColorMode::Binary,
        _ => ColorMode::Color,
    };

    Config {
        color_mode,
        hierarchical,
        filter_speckle: options.filter_speckle as usize,
        color_precision: options.color_precision as i32,
        layer_difference: options.layer_difference,
        mode,
        corner_threshold: options.corner_threshold as i32,
        length_threshold: 4.0,
        max_iterations: 10,
        splice_threshold: options.splice_threshold as i32,
        path_precision: Some(options.path_precision as u32),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vectorize::presets;
    use std::path::{Path, PathBuf};

    #[test]
    fn rejects_a_trace_buffer_beyond_the_rgba_bound() {
        assert!(ensure_trace_rgba_bound(4096, 4096).is_ok());
        assert!(ensure_trace_rgba_bound(4097, 4096).is_err());
    }

    #[test]
    fn logo_preset_builds_config() {
        let opts = presets::logo_flat();
        let cfg = options_to_config(&opts);
        assert_eq!(cfg.filter_speckle, 4);
        assert_eq!(cfg.color_precision, 6);
    }

    #[test]
    fn converts_logo_fixture() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../testdata/logo_flat.png");
        if !path.exists() {
            return;
        }
        let svg = convert_image_path_with_checkpoints(&path, &presets::logo_flat(), |_| Ok(()))
            .expect("convert logo fixture");
        assert!(svg.contains("<svg") || svg.contains("<path"));
    }

    #[test]
    fn cancellation_is_honored_between_owned_stages() {
        let mut stages = Vec::new();
        let error = convert_image_path_with_checkpoints(
            Path::new("missing.png"),
            &presets::logo_flat(),
            |stage| {
                stages.push(stage);
                Err("cancelled".into())
            },
        )
        .unwrap_err();
        assert_eq!(error, "cancelled");
        assert_eq!(stages, ["decode"]);

        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../testdata/logo_flat.png");
        if !path.exists() {
            return;
        }
        stages.clear();
        let error = convert_image_path_with_checkpoints(&path, &presets::logo_flat(), |stage| {
            stages.push(stage);
            if stage == "trace" {
                Err("cancelled".into())
            } else {
                Ok(())
            }
        })
        .unwrap_err();
        assert_eq!(error, "cancelled");
        assert_eq!(stages, ["decode", "resize", "trace"]);
    }
}
