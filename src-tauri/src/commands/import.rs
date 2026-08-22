use std::io::Cursor;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::ImageFormat;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    std::fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Decode an image from disk and return a PNG data URL for the Convert raster pane.
#[tauri::command]
pub fn read_image_preview(path: String) -> Result<String, String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
    let img = img.thumbnail(1280, 1280);
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode preview: {e}"))?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(buf)))
}
