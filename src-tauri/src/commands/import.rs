use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::{GenericImageView, ImageFormat};
use serde::Serialize;

use super::destination_grants::DestinationGrantManager;
use super::file_identity::{fingerprint, FileFingerprint};
use super::source_grants::SourceGrantManager;
use tauri::State;

const MAX_TEXT_FILE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTextResult {
    contents: String,
    fingerprint: FileFingerprint,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreview {
    data_url: String,
    width: u32,
    height: u32,
    byte_size: u64,
    format: String,
}

fn read_text_file_with_limit(path: &Path, max_bytes: u64) -> Result<ReadTextResult, String> {
    let display = path.display();
    let file = File::open(path).map_err(|e| format!("Failed to open {display}: {e}"))?;
    let size = file
        .metadata()
        .map_err(|e| format!("Failed to inspect {display}: {e}"))?
        .len();
    if size > max_bytes {
        return Err(format!(
            "File is too large ({size} bytes; limit is {max_bytes})"
        ));
    }

    let mut bytes = Vec::with_capacity(size as usize);
    file.take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read {display}: {e}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "File grew beyond the {max_bytes}-byte limit while it was being read"
        ));
    }
    let contents =
        String::from_utf8(bytes).map_err(|_| "File is not valid UTF-8 text".to_string())?;
    Ok(ReadTextResult {
        contents,
        fingerprint: fingerprint(path)?,
    })
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<ReadTextResult, String> {
    read_text_file_with_limit(Path::new(&path), MAX_TEXT_FILE_BYTES)
}

#[tauri::command]
pub fn read_project_file(
    grants: State<'_, DestinationGrantManager>,
    destination_grant_id: String,
) -> Result<ReadTextResult, String> {
    let path = grants.resolve_project(&destination_grant_id)?;
    read_text_file_with_limit(&path, MAX_TEXT_FILE_BYTES)
}

fn image_format_label(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_uppercase())
        .filter(|extension| !extension.is_empty())
        .unwrap_or_else(|| "IMAGE".into())
}

fn preview_image_path(path: &Path) -> Result<ImagePreview, String> {
    let byte_size = fs::metadata(path)
        .map_err(|e| format!("Failed to inspect image: {e}"))?
        .len();
    let img = image::open(path).map_err(|e| format!("Failed to open image: {e}"))?;
    let (width, height) = img.dimensions();
    let img = img.thumbnail(1280, 1280);
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode preview: {e}"))?;
    Ok(ImagePreview {
        data_url: format!("data:image/png;base64,{}", STANDARD.encode(buf)),
        width,
        height,
        byte_size,
        format: image_format_label(path),
    })
}

/// Decode an image from disk and return a PNG data URL plus source metadata.
#[tauri::command]
pub fn read_image_preview(
    grants: State<'_, SourceGrantManager>,
    source_grant_id: String,
) -> Result<ImagePreview, String> {
    let path = grants.resolve(&source_grant_id)?;
    preview_image_path(&path)
}

#[cfg(test)]
mod tests {
    use super::{preview_image_path, read_text_file_with_limit};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn bounded_text_read_accepts_limit_and_rejects_larger_files() {
        let path = std::env::temp_dir().join(format!(
            "savage-read-limit-{}-{}.txt",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));

        fs::write(&path, b"1234").expect("write exact-limit fixture");
        assert_eq!(
            read_text_file_with_limit(&path, 4).unwrap().contents,
            "1234"
        );

        fs::write(&path, b"12345").expect("write over-limit fixture");
        let error = read_text_file_with_limit(&path, 4).unwrap_err();
        assert!(error.contains("too large"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn preview_includes_source_dimensions_and_bytes() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../testdata/logo_flat.png");
        if !path.exists() {
            return;
        }
        let preview = preview_image_path(&path).expect("preview logo fixture");
        assert!(preview.data_url.starts_with("data:image/png;base64,"));
        assert!(preview.width > 0 && preview.height > 0);
        assert!(preview.byte_size > 0);
        assert_eq!(preview.format, "PNG");
    }
}
