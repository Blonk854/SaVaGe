use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::destination_grants::DestinationGrantManager;
use super::diagnostics::{DiagnosticLevel, DiagnosticLog};
use super::file_identity::{fingerprint, FileFingerprint};

const MAX_TEXT_OUTPUT_BYTES: usize = 32 * 1024 * 1024;
const MAX_PNG_SVG_BYTES: usize = MAX_TEXT_OUTPUT_BYTES;
const MAX_PNG_OUTPUT_BYTES: usize = 256 * 1024 * 1024;
const MAX_PNG_DIMENSION: u32 = 16_384;
const MAX_PNG_PIXELS: u64 = 40_000_000;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn temporary_path(destination: &Path, attempt: u64) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Destination has no parent directory".to_string())?;
    let name = destination
        .file_name()
        .ok_or_else(|| "Destination has no file name".to_string())?
        .to_string_lossy();
    Ok(parent.join(format!(
        ".{name}.savage-tmp-{}-{}",
        std::process::id(),
        attempt
    )))
}

#[cfg(windows)]
fn replace_existing(destination: &Path, replacement: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: u32,
            exclude: *mut core::ffi::c_void,
            reserved: *mut core::ffi::c_void,
        ) -> i32;
    }

    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replacement_wide: Vec<u16> = replacement
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = unsafe {
        ReplaceFileW(
            destination_wide.as_ptr(),
            replacement_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(format!(
            "Failed to replace {}: {}",
            destination.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_existing(destination: &Path, replacement: &Path) -> Result<(), String> {
    fs::rename(replacement, destination).map_err(|e| {
        format!(
            "Failed to replace {} with {}: {e}",
            destination.display(),
            replacement.display()
        )
    })
}

pub(crate) fn write_text_file_atomic(
    path: &Path,
    contents: &[u8],
    max_bytes: usize,
    expected_fingerprint: Option<&FileFingerprint>,
) -> Result<FileFingerprint, String> {
    if contents.len() > max_bytes {
        return Err(format!(
            "Output is too large ({} bytes; limit is {max_bytes})",
            contents.len()
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Destination has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;

    if let Some(expected) = expected_fingerprint {
        let actual = fingerprint(path).map_err(|error| format!("conflict: {error}"))?;
        if &actual != expected {
            return Err("conflict: destination changed since it was opened or saved".to_string());
        }
    }

    let mut temporary = None;
    for _ in 0..100 {
        let attempt = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = temporary_path(path, attempt)?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create temporary file: {error}")),
        }
    }
    let (temporary_path, mut file) =
        temporary.ok_or_else(|| "Failed to allocate a unique temporary file".to_string())?;
    let result = (|| {
        file.write_all(contents)
            .map_err(|e| format!("Failed to write temporary file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Failed to flush temporary file: {e}"))?;
        drop(file);
        if let Some(expected) = expected_fingerprint {
            let actual = fingerprint(path).map_err(|error| format!("conflict: {error}"))?;
            if &actual != expected {
                return Err("conflict: destination changed while saving".to_string());
            }
        }
        if path.exists() {
            replace_existing(path, &temporary_path)
        } else {
            fs::rename(&temporary_path, path)
                .map_err(|e| format!("Failed to install {}: {e}", path.display()))
        }
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result?;
    fingerprint(path)
}

fn png_export_scale(scale: Option<f32>) -> f32 {
    scale.unwrap_or(1.0).clamp(0.25, 8.0)
}

fn planned_png_size(svg_width: f32, svg_height: f32, scale: f32) -> Result<(u32, u32), String> {
    if !svg_width.is_finite() || !svg_height.is_finite() || svg_width <= 0.0 || svg_height <= 0.0 {
        return Err("PNG source size is invalid".to_string());
    }
    let width = (svg_width * scale).round();
    let height = (svg_height * scale).round();
    if !width.is_finite() || !height.is_finite() {
        return Err("PNG export size is not finite".to_string());
    }
    ensure_png_bounds(width.max(1.0) as u32, height.max(1.0) as u32)
}

fn ensure_png_bounds(width: u32, height: u32) -> Result<(u32, u32), String> {
    if width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION {
        return Err(format!(
            "PNG is {width}×{height}; limit is {MAX_PNG_DIMENSION} per side"
        ));
    }
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if pixels > MAX_PNG_PIXELS {
        return Err(format!("PNG is {pixels} pixels; limit is {MAX_PNG_PIXELS}"));
    }
    Ok((width, height))
}

fn ensure_png_svg_len(len: usize) -> Result<(), String> {
    if len > MAX_PNG_SVG_BYTES {
        Err(format!("SVG is {len} bytes; limit is {MAX_PNG_SVG_BYTES}"))
    } else {
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobRequest {
    job_id: String,
    session_id: String,
    source_revision: u64,
    destination_grant_id: String,
    contents: String,
    #[serde(default)]
    scale: Option<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobResult {
    job_id: String,
    session_id: String,
    source_revision: u64,
}

#[derive(Debug, Serialize)]
pub struct ExportJobError {
    code: &'static str,
    message: String,
    job_id: String,
}

impl ExportJobError {
    fn new(code: &'static str, message: impl Into<String>, job_id: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            job_id: job_id.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportJobState {
    Running,
    CancelRequested,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobSnapshot {
    job_id: String,
    session_id: String,
    state: ExportJobState,
}

#[derive(Clone, Default)]
struct JobCancellation {
    requested: Arc<AtomicBool>,
}

impl JobCancellation {
    fn request(&self) {
        self.requested.store(true, Ordering::Release);
    }

    fn is_requested(&self) -> bool {
        self.requested.load(Ordering::Acquire)
    }

    fn checkpoint(&self, stage: &'static str, job_id: &str) -> Result<(), ExportJobError> {
        if self.is_requested() {
            Err(ExportJobError::new(
                "cancelled",
                format!("Export was cancelled before the {stage} stage completed"),
                job_id,
            ))
        } else {
            Ok(())
        }
    }
}

struct ActiveExportJob {
    job_id: String,
    session_id: String,
    cancel: JobCancellation,
}

#[derive(Clone, Default)]
pub struct ExportJobManager {
    slot: Arc<Mutex<Option<ActiveExportJob>>>,
}

struct ExportPermit {
    slot: Arc<Mutex<Option<ActiveExportJob>>>,
}

impl Drop for ExportPermit {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = None;
        }
    }
}

impl ExportJobManager {
    fn try_start(
        &self,
        job_id: &str,
        session_id: &str,
    ) -> Result<(ExportPermit, JobCancellation), ExportJobError> {
        let mut slot = self
            .slot
            .lock()
            .map_err(|_| ExportJobError::new("worker_failed", "Export job state failed", job_id))?;
        if slot.is_some() {
            return Err(ExportJobError::new(
                "job_busy",
                "Another export is already running",
                job_id,
            ));
        }
        let cancel = JobCancellation::default();
        *slot = Some(ActiveExportJob {
            job_id: job_id.into(),
            session_id: session_id.into(),
            cancel: cancel.clone(),
        });
        Ok((
            ExportPermit {
                slot: Arc::clone(&self.slot),
            },
            cancel,
        ))
    }

    fn request_cancel(&self, job_id: &str) -> Result<ExportJobSnapshot, ExportJobError> {
        let slot = self
            .slot
            .lock()
            .map_err(|_| ExportJobError::new("worker_failed", "Export job state failed", job_id))?;
        let Some(job) = slot.as_ref() else {
            return Err(ExportJobError::new(
                "job_not_running",
                "No export is running",
                job_id,
            ));
        };
        if job.job_id != job_id {
            return Err(ExportJobError::new(
                "stale_job",
                "That export is no longer running",
                job_id,
            ));
        }
        job.cancel.request();
        Ok(Self::snapshot_locked(job))
    }

    #[cfg(test)]
    fn snapshot(&self, job_id: &str) -> Result<ExportJobSnapshot, ExportJobError> {
        let slot = self
            .slot
            .lock()
            .map_err(|_| ExportJobError::new("worker_failed", "Export job state failed", job_id))?;
        let Some(job) = slot.as_ref() else {
            return Err(ExportJobError::new(
                "job_not_running",
                "No export is running",
                job_id,
            ));
        };
        if job.job_id != job_id {
            return Err(ExportJobError::new(
                "stale_job",
                "That export is no longer running",
                job_id,
            ));
        }
        Ok(Self::snapshot_locked(job))
    }

    fn snapshot_locked(job: &ActiveExportJob) -> ExportJobSnapshot {
        ExportJobSnapshot {
            job_id: job.job_id.clone(),
            session_id: job.session_id.clone(),
            state: if job.cancel.is_requested() {
                ExportJobState::CancelRequested
            } else {
                ExportJobState::Running
            },
        }
    }
}

fn validate_id(value: &str, label: &str, job_id: &str) -> Result<(), ExportJobError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ExportJobError::new(
            "invalid_input",
            format!("Invalid {label}"),
            job_id,
        ));
    }
    Ok(())
}

fn export_stage(code: &str) -> &'static str {
    match code {
        "job_busy" => "queue",
        "invalid_input" | "destination_not_authorized" | "stale_job" | "job_not_running" => {
            "authorize"
        }
        "invalid_svg" => "parse",
        "export_failed" => "render",
        "output_too_large" => "output",
        "worker_failed" => "worker",
        "cancelled" => "cancel",
        "ok" => "complete",
        _ => "unknown",
    }
}

fn map_write_error(message: String, job_id: &str) -> ExportJobError {
    if message.contains("too large") {
        ExportJobError::new("output_too_large", message, job_id)
    } else {
        ExportJobError::new("export_failed", message, job_id)
    }
}

fn run_svg_export(
    path: &Path,
    contents: &[u8],
    cancel: &JobCancellation,
    job_id: &str,
) -> Result<(), ExportJobError> {
    cancel.checkpoint("write", job_id)?;
    write_text_file_atomic(path, contents, MAX_TEXT_OUTPUT_BYTES, None)
        .map(|_| ())
        .map_err(|message| map_write_error(message, job_id))
}

fn render_png_with_cancel(
    path: &Path,
    svg: &str,
    scale: Option<f32>,
    cancel: &JobCancellation,
    job_id: &str,
) -> Result<(), ExportJobError> {
    cancel.checkpoint("parse", job_id)?;
    ensure_png_svg_len(svg.len())
        .map_err(|message| ExportJobError::new("output_too_large", message, job_id))?;
    let scale = png_export_scale(scale);
    let tree = Tree::from_str(svg, &Options::default()).map_err(|error| {
        ExportJobError::new("invalid_svg", format!("Invalid SVG: {error}"), job_id)
    })?;
    let size = tree.size();
    let (width, height) = planned_png_size(size.width(), size.height(), scale)
        .map_err(|message| ExportJobError::new("export_failed", message, job_id))?;
    cancel.checkpoint("render", job_id)?;
    let mut pixmap = Pixmap::new(width, height).ok_or_else(|| {
        ExportJobError::new("export_failed", "Failed to allocate PNG pixmap", job_id)
    })?;
    resvg::render(
        &tree,
        Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    cancel.checkpoint("write", job_id)?;
    let bytes = pixmap.encode_png().map_err(|error| {
        ExportJobError::new(
            "export_failed",
            format!("Failed to encode PNG: {error}"),
            job_id,
        )
    })?;
    write_text_file_atomic(path, &bytes, MAX_PNG_OUTPUT_BYTES, None)
        .map(|_| ())
        .map_err(|message| map_write_error(message, job_id))
}

#[cfg(test)]
fn render_png_to_path(path: &Path, svg: &str, scale: Option<f32>) -> Result<(), String> {
    render_png_with_cancel(path, svg, scale, &JobCancellation::default(), "png")
        .map_err(|error| error.message)
}

async fn export_once<F>(
    manager: State<'_, ExportJobManager>,
    job_id: String,
    session_id: String,
    work: F,
) -> Result<(), ExportJobError>
where
    F: FnOnce(&JobCancellation) -> Result<(), ExportJobError> + Send + 'static,
{
    validate_id(&job_id, "job ID", &job_id)?;
    validate_id(&session_id, "session ID", &job_id)?;
    let (permit, cancel) = manager.try_start(&job_id, &session_id)?;
    let worker_job_id = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        work(&cancel)
    })
    .await
    .map_err(|error| ExportJobError::new("worker_failed", error.to_string(), worker_job_id))?
}

fn finish_export(
    log: &DiagnosticLog,
    started: Instant,
    job_id: &str,
    session_id: &str,
    source_revision: u64,
    result: Result<(), ExportJobError>,
) -> Result<ExportJobResult, ExportJobError> {
    match &result {
        Ok(_) => log.record(
            DiagnosticLevel::Info,
            "ok",
            "export",
            "Export succeeded",
            None,
            Some(job_id),
            Some(session_id),
            Some(export_stage("ok")),
            Some(started.elapsed().as_millis() as u64),
        ),
        Err(error) if error.code == "cancelled" => log.record(
            DiagnosticLevel::Warn,
            error.code,
            "export",
            &error.message,
            None,
            Some(&error.job_id),
            Some(session_id),
            Some(export_stage(error.code)),
            Some(started.elapsed().as_millis() as u64),
        ),
        Err(error) => log.record(
            DiagnosticLevel::Error,
            error.code,
            "export",
            &error.message,
            None,
            Some(&error.job_id),
            Some(session_id),
            Some(export_stage(error.code)),
            Some(started.elapsed().as_millis() as u64),
        ),
    }
    result.map(|_| ExportJobResult {
        job_id: job_id.into(),
        session_id: session_id.into(),
        source_revision,
    })
}

#[tauri::command]
pub fn write_project_file(
    grants: State<'_, DestinationGrantManager>,
    log: State<'_, DiagnosticLog>,
    destination_grant_id: String,
    contents: String,
    expected_fingerprint: Option<FileFingerprint>,
) -> Result<FileFingerprint, String> {
    let path = grants.resolve_project(&destination_grant_id)?;
    match write_text_file_atomic(
        &path,
        contents.as_bytes(),
        MAX_TEXT_OUTPUT_BYTES,
        expected_fingerprint.as_ref(),
    ) {
        Ok(fingerprint) => Ok(fingerprint),
        Err(message) => {
            log.record(
                DiagnosticLevel::Error,
                if message.starts_with("conflict:") {
                    "save_conflict"
                } else {
                    "save_failed"
                },
                "save",
                &message,
                None,
                None,
                None,
                Some("write"),
                None,
            );
            Err(message)
        }
    }
}

#[tauri::command]
pub fn cancel_export_job(
    manager: State<'_, ExportJobManager>,
    job_id: String,
) -> Result<ExportJobSnapshot, ExportJobError> {
    validate_id(&job_id, "job ID", &job_id)?;
    manager.request_cancel(&job_id)
}

#[tauri::command]
pub async fn write_svg_export(
    manager: State<'_, ExportJobManager>,
    grants: State<'_, DestinationGrantManager>,
    log: State<'_, DiagnosticLog>,
    request: ExportJobRequest,
) -> Result<ExportJobResult, ExportJobError> {
    let started = Instant::now();
    let job_id = request.job_id.clone();
    let session_id = request.session_id.clone();
    let source_revision = request.source_revision;
    let grant_id = request.destination_grant_id.clone();
    let path = grants
        .resolve_svg(&grant_id)
        .map_err(|message| ExportJobError::new("destination_not_authorized", message, &job_id))?;
    let contents = request.contents.into_bytes();
    let worker_job_id = job_id.clone();
    let result = export_once(manager, job_id.clone(), session_id.clone(), move |cancel| {
        cancel.checkpoint("authorize", &worker_job_id)?;
        run_svg_export(&path, &contents, cancel, &worker_job_id)
    })
    .await;
    if result.is_ok() {
        let _ = grants.consume_svg(&grant_id);
    }
    finish_export(&log, started, &job_id, &session_id, source_revision, result)
}

#[tauri::command]
pub async fn export_png(
    manager: State<'_, ExportJobManager>,
    grants: State<'_, DestinationGrantManager>,
    log: State<'_, DiagnosticLog>,
    request: ExportJobRequest,
) -> Result<ExportJobResult, ExportJobError> {
    let started = Instant::now();
    let job_id = request.job_id.clone();
    let session_id = request.session_id.clone();
    let source_revision = request.source_revision;
    let grant_id = request.destination_grant_id.clone();
    let path = grants
        .resolve_png(&grant_id)
        .map_err(|message| ExportJobError::new("destination_not_authorized", message, &job_id))?;
    let svg = request.contents;
    let scale = request.scale;
    let worker_job_id = job_id.clone();
    let result = export_once(manager, job_id.clone(), session_id.clone(), move |cancel| {
        cancel.checkpoint("authorize", &worker_job_id)?;
        render_png_with_cancel(&path, &svg, scale, cancel, &worker_job_id)
    })
    .await;
    if result.is_ok() {
        let _ = grants.consume_png(&grant_id);
    }
    finish_export(&log, started, &job_id, &session_id, source_revision, result)
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_png_bounds, ensure_png_svg_len, planned_png_size, render_png_to_path,
        render_png_with_cancel, run_svg_export, write_text_file_atomic, ExportJobManager,
        ExportJobState, MAX_PNG_DIMENSION, MAX_PNG_PIXELS, MAX_PNG_SVG_BYTES,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn atomic_text_write_creates_and_replaces_without_temp_leaks() {
        let dir = std::env::temp_dir().join(format!(
            "savage-atomic-write-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create fixture directory");
        let path = dir.join("project.savage");

        let first = write_text_file_atomic(&path, b"first", 5, None).expect("create destination");
        assert_eq!(fs::read(&path).unwrap(), b"first");
        let second =
            write_text_file_atomic(&path, b"second", 6, Some(&first)).expect("replace destination");
        assert_eq!(fs::read(&path).unwrap(), b"second");
        assert_ne!(first, second);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        assert!(
            write_text_file_atomic(&path, b"too large", 3, Some(&second))
                .unwrap_err()
                .contains("too large")
        );
        assert_eq!(fs::read(&path).unwrap(), b"second");

        fs::write(&path, b"external change").expect("modify destination externally");
        assert!(write_text_file_atomic(&path, b"third", 5, Some(&second))
            .unwrap_err()
            .contains("conflict"));
        assert_eq!(fs::read(&path).unwrap(), b"external change");

        let overwritten =
            write_text_file_atomic(&path, b"third", 5, None).expect("explicit overwrite");
        assert_eq!(fs::read(&path).unwrap(), b"third");
        assert_ne!(overwritten, second);

        fs::remove_dir_all(dir).expect("remove fixture directory");
    }

    #[cfg(windows)]
    #[test]
    fn locked_destination_keeps_the_original_file() {
        use std::fs::OpenOptions;
        use std::os::windows::fs::OpenOptionsExt;

        let dir = std::env::temp_dir().join(format!(
            "savage-locked-write-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create fixture directory");
        let path = dir.join("project.savage");
        fs::write(&path, b"original").expect("seed destination");
        let _hold = OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&path)
            .expect("exclusive lock");
        let error =
            write_text_file_atomic(&path, b"changed", 16, None).expect_err("lock should fail");
        drop(_hold);
        assert!(
            error.contains("Failed to replace")
                || error.contains("sharing")
                || error.contains("os error"),
            "unexpected lock error: {error}"
        );
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).expect("remove fixture directory");
    }

    fn unique_dir(prefix: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "{prefix}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create fixture directory");
        dir
    }

    #[test]
    fn readonly_unicode_and_directory_collision_keep_the_original() {
        let dir = unique_dir("savage-fs-fault");
        let unicode = dir.join("海报项目.savage");
        write_text_file_atomic(&unicode, b"keep", 16, None).expect("unicode create");
        let mut permissions = fs::metadata(&unicode).expect("metadata").permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&unicode, permissions.clone()).expect("mark readonly");
        let readonly_error = write_text_file_atomic(&unicode, b"new", 16, None);
        permissions.set_readonly(false);
        let _ = fs::set_permissions(&unicode, permissions);
        if readonly_error.is_err() {
            assert_eq!(fs::read(&unicode).unwrap(), b"keep");
        } else {
            assert_eq!(fs::read(&unicode).unwrap(), b"new");
        }

        let collision = dir.join("folder.savage");
        fs::create_dir_all(&collision).expect("directory occupying destination");
        assert!(write_text_file_atomic(&collision, b"data", 16, None).is_err());
        assert!(collision.is_dir());

        let leftover = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .any(|entry| entry.file_name().to_string_lossy().contains(".savage-tmp-"));
        assert!(!leftover, "failed writes must not leave temporaries");
        fs::remove_dir_all(dir).expect("remove fixture directory");
    }

    #[cfg(windows)]
    #[test]
    fn missing_volume_and_long_paths_do_not_write_a_partial_file() {
        if let Some(path) = (b'F'..=b'Z').rev().find_map(|letter| {
            let root = std::path::PathBuf::from(format!("{}:\\", letter as char));
            if root.exists() {
                None
            } else {
                Some(root.join("SaVaGe-missing-volume\\project.savage"))
            }
        }) {
            let error =
                write_text_file_atomic(&path, b"data", 16, None).expect_err("missing volume");
            assert!(
                error.contains("Failed to create") || error.contains("os error"),
                "unexpected missing-volume error: {error}"
            );
            assert!(!path.exists());
        }

        let dir = unique_dir("savage-long-path");
        let long_name = format!("{}.savage", "n".repeat(200));
        let long_path = dir.join(long_name);
        match write_text_file_atomic(&long_path, b"long", 16, None) {
            Ok(_) => assert_eq!(fs::read(&long_path).unwrap(), b"long"),
            Err(_) => assert!(!long_path.exists()),
        }
        let leftover = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .any(|entry| entry.file_name().to_string_lossy().contains(".savage-tmp-"));
        assert!(!leftover);
        fs::remove_dir_all(dir).expect("remove fixture directory");
    }

    #[test]
    fn png_preflight_rejects_oversize_before_pixmap_allocation() {
        assert!(ensure_png_bounds(MAX_PNG_DIMENSION, 1).is_ok());
        assert!(ensure_png_bounds(8_000, 5_000).is_ok());
        assert!(ensure_png_bounds(MAX_PNG_DIMENSION + 1, 1)
            .unwrap_err()
            .contains("per side"));
        let over_pixels = ((MAX_PNG_PIXELS / 10_000) + 1) as u32;
        assert!(ensure_png_bounds(10_000, over_pixels)
            .unwrap_err()
            .contains("pixels"));
        assert_eq!(planned_png_size(100.0, 50.0, 2.0).unwrap(), (200, 100));
        assert!(planned_png_size(20_000.0, 20.0, 1.0)
            .unwrap_err()
            .contains("per side"));
        assert!(planned_png_size(10_000.0, 10_000.0, 1.0)
            .unwrap_err()
            .contains("pixels"));

        let dir = unique_dir("savage-png-bounds");
        let huge = dir.join("huge.png");
        let error = render_png_to_path(
            &huge,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20"></svg>"#,
            Some(1.0),
        )
        .expect_err("dimension cap");
        assert!(error.contains("per side"), "{error}");
        assert!(!huge.exists());

        assert!(ensure_png_svg_len(MAX_PNG_SVG_BYTES).is_ok());
        assert!(ensure_png_svg_len(MAX_PNG_SVG_BYTES + 1)
            .unwrap_err()
            .contains("bytes"));

        let ok = dir.join("ok.png");
        render_png_to_path(
            &ok,
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#111"/></svg>"##,
            Some(1.0),
        )
        .expect("small png");
        assert!(ok.is_file());
        fs::remove_dir_all(dir).expect("remove fixture directory");
    }

    #[test]
    fn permits_only_one_export_until_the_worker_finishes() {
        let manager = ExportJobManager::default();
        let (permit, _) = manager
            .try_start("job_1", "session_1")
            .expect("first job starts");
        let error = match manager.try_start("job_2", "session_1") {
            Ok(_) => panic!("second job should be rejected"),
            Err(error) => error,
        };
        assert_eq!(error.code, "job_busy");
        drop(permit);
        assert!(manager.try_start("job_3", "session_1").is_ok());
    }

    #[test]
    fn cancel_keeps_the_slot_and_skips_the_write() {
        let manager = ExportJobManager::default();
        let (permit, cancel) = manager
            .try_start("job_1", "session_1")
            .expect("first job starts");
        assert_eq!(
            manager.snapshot("job_1").expect("running").state,
            ExportJobState::Running
        );
        let snapshot = manager.request_cancel("job_1").expect("cancel requested");
        assert_eq!(snapshot.state, ExportJobState::CancelRequested);
        assert!(cancel.is_requested());
        let busy = match manager.try_start("job_2", "session_1") {
            Ok(_) => panic!("second job should still be rejected"),
            Err(error) => error,
        };
        assert_eq!(busy.code, "job_busy");
        assert_eq!(
            manager.request_cancel("job_missing").unwrap_err().code,
            "stale_job"
        );

        let dir = unique_dir("savage-export-cancel");
        let svg_path = dir.join("skip.svg");
        let png_path = dir.join("skip.png");
        let svg_error =
            run_svg_export(&svg_path, b"<svg></svg>", &cancel, "job_1").expect_err("cancelled svg");
        assert_eq!(svg_error.code, "cancelled");
        assert!(!svg_path.exists());
        let png_error = render_png_with_cancel(
            &png_path,
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#111"/></svg>"##,
            Some(1.0),
            &cancel,
            "job_1",
        )
        .expect_err("cancelled png");
        assert_eq!(png_error.code, "cancelled");
        assert!(!png_path.exists());

        drop(permit);
        assert_eq!(
            manager.request_cancel("job_1").unwrap_err().code,
            "job_not_running"
        );
        fs::remove_dir_all(dir).expect("remove fixture directory");
    }
}
