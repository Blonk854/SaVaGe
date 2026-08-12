use image::imageops::FilterType;
use image::GenericImageView;
use visioncortex::PathSimplifyMode;
use vtracer::{ColorImage, ColorMode, Config, Hierarchical};

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

pub fn convert_image_path(path: &str, options: &ConvertOptions) -> Result<String, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open image: {e}"))?;
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

    let rgba = img.to_rgba8();
    let (width, height) = (rgba.width() as usize, rgba.height() as usize);
    let color_image = ColorImage {
        pixels: rgba.into_raw(),
        width,
        height,
    };

    let config = options_to_config(options);
    let svg = vtracer::convert(color_image, config)?;
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
    use std::path::PathBuf;

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
        let svg = convert_image_path(path.to_str().unwrap(), &presets::logo_flat())
            .expect("convert logo fixture");
        assert!(svg.contains("<svg") || svg.contains("<path"));
    }
}
