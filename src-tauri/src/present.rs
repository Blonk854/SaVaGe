//! Records WebView2 element-timing presentation of the Open Image control.
//! The destination path comes from `SAVAGE_PRESENT_FILE`, never from the webview.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::commands::export::write_text_file_atomic;

const OPEN_IMAGE: &str = "open-image";
const NO_PRESENTATION: &str = "no-presentation-time";
const PRESENT_MAX_MS: f64 = 120_000.0;
const PRESENT_ORIGIN_MIN_MS: f64 = 1_577_836_800_000.0;
const PRESENT_ORIGIN_MAX_MS: f64 = 4_102_444_800_000.0;
const PRESENT_FILE: &str = "present.json";
const MAX_PRESENT_BYTES: usize = 8 * 1024;

static PRESENT_ONCE: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenImagePresentRequest {
    identifier: String,
    time_origin_unix_ms: f64,
    #[serde(default)]
    paint_time_ms: Option<f64>,
    #[serde(default)]
    presentation_time_ms: Option<f64>,
    #[serde(default)]
    render_time_ms: Option<f64>,
    #[serde(default)]
    unavailable: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PresentFile {
    status: &'static str,
    definition: &'static str,
    identifier: &'static str,
    time_origin_unix_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    paint_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    presentation_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    presented_unix_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    render_time_ms: Option<f64>,
    received_unix_ms: f64,
}

fn unix_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn duration_in_range(value: f64) -> bool {
    value.is_finite() && (0.0..=PRESENT_MAX_MS).contains(&value)
}

fn origin_in_range(value: f64) -> bool {
    value.is_finite() && (PRESENT_ORIGIN_MIN_MS..PRESENT_ORIGIN_MAX_MS).contains(&value)
}

fn present_destination(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("SAVAGE_PRESENT_FILE must be absolute".into());
    }
    if path.file_name().and_then(|name| name.to_str()) != Some(PRESENT_FILE) {
        return Err("SAVAGE_PRESENT_FILE must be named present.json".into());
    }
    let parent = path
        .parent()
        .filter(|parent| parent.is_dir())
        .ok_or_else(|| "SAVAGE_PRESENT_FILE parent does not exist".to_string())?;
    Ok(parent.join(PRESENT_FILE))
}

fn optional_duration(value: Option<f64>, label: &str) -> Result<Option<f64>, String> {
    match value {
        Some(value) if duration_in_range(value) => Ok(Some(value)),
        Some(_) => Err(format!("{label} is not a startup duration")),
        None => Ok(None),
    }
}

fn present_document(request: &OpenImagePresentRequest) -> Result<PresentFile, String> {
    if request.identifier != OPEN_IMAGE {
        return Err("Present identifier must be open-image".into());
    }
    if !origin_in_range(request.time_origin_unix_ms) {
        return Err("Present time origin is outside the measured range".into());
    }
    let paint_time_ms = optional_duration(request.paint_time_ms, "paintTime")?;
    let render_time_ms = optional_duration(request.render_time_ms, "renderTime")?;
    let received_unix_ms = unix_ms();
    if let Some(presentation_time_ms) = request.presentation_time_ms {
        if !presentation_time_ms.is_finite()
            || presentation_time_ms <= 0.0
            || presentation_time_ms > PRESENT_MAX_MS
        {
            return Err("presentationTime is not a startup present time".into());
        }
        let presented_unix_ms = request.time_origin_unix_ms + presentation_time_ms;
        if !presented_unix_ms.is_finite() {
            return Err("presented time is not finite".into());
        }
        return Ok(PresentFile {
            status: "presented",
            definition: "presentationTime is the WebView2 element-timing timestamp for the empty-converter title in the first frame that also presents Open Image. Button text does not emit element timing. This is not accessibility-tree time and not paintTime.",
            identifier: OPEN_IMAGE,
            time_origin_unix_ms: request.time_origin_unix_ms,
            reason: None,
            paint_time_ms,
            presentation_time_ms: Some(presentation_time_ms),
            presented_unix_ms: Some(presented_unix_ms),
            render_time_ms: None,
            received_unix_ms,
        });
    }
    if request.unavailable.as_deref() == Some(NO_PRESENTATION) {
        return Ok(PresentFile {
            status: "unavailable",
            definition: "The Open Image element was observed, and WebView2 did not provide element-timing presentationTime. paintTime and renderTime are not present time.",
            identifier: OPEN_IMAGE,
            time_origin_unix_ms: request.time_origin_unix_ms,
            reason: Some(NO_PRESENTATION),
            paint_time_ms,
            presentation_time_ms: None,
            presented_unix_ms: None,
            render_time_ms,
            received_unix_ms,
        });
    }
    Err("presentationTime is missing".into())
}

pub fn record_open_image_present_at_path(
    path: &Path,
    request: &OpenImagePresentRequest,
    written: &AtomicBool,
) -> Result<(), String> {
    let destination = present_destination(path)?;
    let document = present_document(request)?;
    if written
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }
    let body = serde_json::to_string_pretty(&document).map_err(|error| error.to_string())?;
    if let Err(error) =
        write_text_file_atomic(&destination, body.as_bytes(), MAX_PRESENT_BYTES, None)
    {
        written.store(false, Ordering::Release);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn record_open_image_present(stamp: OpenImagePresentRequest) -> Result<(), String> {
    let Some(raw) = std::env::var_os("SAVAGE_PRESENT_FILE") else {
        return Ok(());
    };
    record_open_image_present_at_path(Path::new(&raw), &stamp, &PRESENT_ONCE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    fn request(presentation: Option<f64>, unavailable: Option<&str>) -> OpenImagePresentRequest {
        OpenImagePresentRequest {
            identifier: OPEN_IMAGE.into(),
            time_origin_unix_ms: 1_767_225_600_000.0,
            paint_time_ms: Some(12.0),
            presentation_time_ms: presentation,
            render_time_ms: Some(18.0),
            unavailable: unavailable.map(str::to_string),
        }
    }

    fn temp_present() -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "savage-present-{}-{}",
            std::process::id(),
            unix_ms() as u64
        ));
        std::fs::create_dir_all(&dir).expect("temp present dir");
        let path = dir.join(PRESENT_FILE);
        (dir, path)
    }

    #[test]
    fn writes_presentation_time_once_and_refuses_paint_only_claims() {
        let (dir, path) = temp_present();
        let gate = AtomicBool::new(false);
        record_open_image_present_at_path(&path, &request(Some(18.5), None), &gate)
            .expect("present write");
        let first: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("read present"))
                .expect("json");
        assert_eq!(first["status"], "presented");
        assert_eq!(first["identifier"], OPEN_IMAGE);
        assert_eq!(first["presentationTimeMs"], 18.5);
        assert_eq!(first["presentedUnixMs"], 1_767_225_600_018.5);
        assert!(first["receivedUnixMs"].as_f64().unwrap() > 0.0);
        assert!(first.get("renderTimeMs").is_none());

        let mut later = request(Some(40.0), None);
        later.paint_time_ms = Some(30.0);
        record_open_image_present_at_path(&path, &later, &gate)
            .expect("second call keeps the first");
        let second: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("reread")).expect("json");
        assert_eq!(second["presentationTimeMs"], 18.5);

        let unavailable_dir = std::env::temp_dir().join(format!(
            "savage-present-unavailable-{}-{}",
            std::process::id(),
            unix_ms() as u64
        ));
        std::fs::create_dir_all(&unavailable_dir).expect("unavailable dir");
        let unavailable_path = unavailable_dir.join(PRESENT_FILE);
        let unavailable_gate = AtomicBool::new(false);
        record_open_image_present_at_path(
            &unavailable_path,
            &request(None, Some(NO_PRESENTATION)),
            &unavailable_gate,
        )
        .expect("unavailable write");
        let missing: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&unavailable_path).expect("read unavailable"),
        )
        .expect("json");
        assert_eq!(missing["status"], "unavailable");
        assert_eq!(missing["reason"], NO_PRESENTATION);
        assert!(missing.get("presentedUnixMs").is_none());
        assert!(missing.get("presentationTimeMs").is_none());

        let mut bad = request(None, None);
        bad.identifier = "other".into();
        assert!(record_open_image_present_at_path(&path, &bad, &AtomicBool::new(false)).is_err());
        assert!(record_open_image_present_at_path(
            &path,
            &request(Some(0.0), Some(NO_PRESENTATION)),
            &AtomicBool::new(false)
        )
        .is_err());
        assert!(record_open_image_present_at_path(
            Path::new("present.json"),
            &request(Some(18.0), None),
            &AtomicBool::new(false)
        )
        .is_err());
        assert!(record_open_image_present_at_path(
            &dir.join("other.json"),
            &request(Some(18.0), None),
            &AtomicBool::new(false)
        )
        .is_err());

        let _ = std::fs::remove_dir_all(dir);
        let _ = std::fs::remove_dir_all(unavailable_dir);
    }
}
