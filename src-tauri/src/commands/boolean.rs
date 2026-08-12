use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct BooleanRequest {
    /// Subject shapes: each shape is a list of contours; each contour is [x,y] points.
    pub subjects: Vec<Vec<Vec<[f64; 2]>>>,
    /// Clip shapes (same structure). For multi-select subtract, subjects = first, clips = rest.
    pub clips: Vec<Vec<Vec<[f64; 2]>>>,
    /// "union" | "intersect" | "subtract" | "exclude"
    pub op: String,
}

#[derive(Debug, Serialize)]
pub struct BooleanResult {
    /// Result shapes as contours of [x,y] points.
    pub shapes: Vec<Vec<Vec<[f64; 2]>>>,
}

fn rule(op: &str) -> Result<OverlayRule, String> {
    match op.to_lowercase().as_str() {
        "union" => Ok(OverlayRule::Union),
        "intersect" | "intersection" => Ok(OverlayRule::Intersect),
        "subtract" | "difference" => Ok(OverlayRule::Difference),
        "exclude" | "xor" => Ok(OverlayRule::Xor),
        other => Err(format!("Unknown boolean op: {other}")),
    }
}

fn to_shapes(input: &[Vec<Vec<[f64; 2]>>]) -> Vec<Vec<Vec<[f64; 2]>>> {
    input
        .iter()
        .filter(|shape| !shape.is_empty() && shape.iter().any(|c| c.len() >= 3))
        .cloned()
        .collect()
}

fn flatten_shapes(shapes: &[Vec<Vec<[f64; 2]>>]) -> Vec<Vec<[f64; 2]>> {
    // i_overlay single overlay accepts subject/clip as collections of contours.
    // We pass each shape's contours; for multi-shape, concatenate contours under one subject group.
    let mut all = Vec::new();
    for shape in shapes {
        for contour in shape {
            if contour.len() >= 3 {
                all.push(contour.clone());
            }
        }
    }
    all
}

#[tauri::command]
pub fn boolean_op(request: BooleanRequest) -> Result<BooleanResult, String> {
    let op = rule(&request.op)?;
    let subjects = to_shapes(&request.subjects);
    let clips = to_shapes(&request.clips);

    if subjects.is_empty() {
        return Err("Boolean needs at least one subject shape".into());
    }

    let subj = flatten_shapes(&subjects);
    let clip = if clips.is_empty() {
        // Self-union / simplify path: overlay subject with itself under Union
        flatten_shapes(&subjects)
    } else {
        flatten_shapes(&clips)
    };

    if subj.is_empty() {
        return Err("Subject contours are empty or degenerate".into());
    }

    let result = subj.overlay(&clip, op, FillRule::EvenOdd);
    let shapes: Vec<Vec<Vec<[f64; 2]>>> = result
        .into_iter()
        .map(|shape| {
            shape
                .into_iter()
                .map(|contour| {
                    contour
                        .into_iter()
                        .map(|p| {
                            // i_overlay may return [f64;2] or a point struct depending on version
                            [p[0], p[1]]
                        })
                        .collect()
                })
                .collect()
        })
        .collect();

    Ok(BooleanResult { shapes })
}
