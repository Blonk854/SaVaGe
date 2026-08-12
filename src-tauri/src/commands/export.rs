use std::fs;
use std::path::PathBuf;

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn export_png(path: String, svg: String, scale: Option<f32>) -> Result<(), String> {
    let scale = scale.unwrap_or(1.0).clamp(0.25, 8.0);
    let opt = Options::default();
    let tree = Tree::from_str(&svg, &opt).map_err(|e| format!("Invalid SVG: {e}"))?;
    let size = tree.size();
    let width = (size.width() * scale).round().max(1.0) as u32;
    let height = (size.height() * scale).round().max(1.0) as u32;

    let mut pixmap =
        Pixmap::new(width, height).ok_or_else(|| "Failed to allocate PNG pixmap".to_string())?;
    let transform = Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    pixmap
        .save_png(&p)
        .map_err(|e| format!("Failed to write PNG {}: {e}", path))?;
    Ok(())
}
