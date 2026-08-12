#![allow(dead_code)]

use super::pipeline::ConvertOptions;

pub fn logo_flat() -> ConvertOptions {
    ConvertOptions {
        color_precision: 6,
        filter_speckle: 4,
        splice_threshold: 45,
        corner_threshold: 60,
        path_precision: 2,
        mode: "spline".into(),
        hierarchical: "stacked".into(),
        layer_difference: 16,
        max_dimension: 2048,
        color_mode: "color".into(),
    }
}

pub fn photo_posterized() -> ConvertOptions {
    ConvertOptions {
        color_precision: 5,
        filter_speckle: 8,
        splice_threshold: 45,
        corner_threshold: 60,
        path_precision: 2,
        mode: "spline".into(),
        hierarchical: "stacked".into(),
        layer_difference: 16,
        max_dimension: 2048,
        color_mode: "color".into(),
    }
}

pub fn line_art() -> ConvertOptions {
    ConvertOptions {
        color_precision: 1,
        filter_speckle: 4,
        splice_threshold: 45,
        corner_threshold: 60,
        path_precision: 2,
        mode: "spline".into(),
        hierarchical: "stacked".into(),
        layer_difference: 16,
        max_dimension: 2048,
        color_mode: "binary".into(),
    }
}

pub fn pixel_perfect() -> ConvertOptions {
    ConvertOptions {
        color_precision: 6,
        filter_speckle: 0,
        splice_threshold: 45,
        corner_threshold: 60,
        path_precision: 0,
        mode: "pixel".into(),
        hierarchical: "stacked".into(),
        layer_difference: 16,
        max_dimension: 1024,
        color_mode: "color".into(),
    }
}
