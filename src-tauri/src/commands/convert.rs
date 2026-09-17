use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use image::ImageReader;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::diagnostics::{DiagnosticLevel, DiagnosticLog};
use super::source_grants::SourceGrantManager;
use crate::vectorize::pipeline::{self, ConvertOptions};

const MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SOURCE_PIXELS: u64 = 40_000_000;
const MAX_SOURCE_DIMENSION: u32 = 16_384;
const MAX_OUTPUT_BYTES: usize = 32 * 1024 * 1024;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertJobRequest {
    job_id: String,
    session_id: String,
    source_revision: u64,
    source_grant_id: String,
    options: ConvertOptionsDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertJobResult {
    job_id: String,
    session_id: String,
    source_revision: u64,
    svg: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertJobError {
    code: &'static str,
    message: String,
    job_id: String,
}

impl ConvertJobError {
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
pub enum ConvertJobState {
    Running,
    CancelRequested,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertJobSnapshot {
    job_id: String,
    session_id: String,
    state: ConvertJobState,
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

    fn checkpoint(&self, stage: &'static str, job_id: &str) -> Result<(), ConvertJobError> {
        if self.is_requested() {
            Err(ConvertJobError::new(
                "cancelled",
                format!("Conversion was cancelled before the {stage} stage completed"),
                job_id,
            ))
        } else {
            Ok(())
        }
    }
}

struct ActiveConvertJob {
    job_id: String,
    session_id: String,
    cancel: JobCancellation,
}

#[derive(Clone, Default)]
pub struct ConvertJobManager {
    slot: Arc<Mutex<Option<ActiveConvertJob>>>,
}

struct ConvertPermit {
    slot: Arc<Mutex<Option<ActiveConvertJob>>>,
}

impl Drop for ConvertPermit {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = None;
        }
    }
}

impl ConvertJobManager {
    fn try_start(
        &self,
        job_id: &str,
        session_id: &str,
    ) -> Result<(ConvertPermit, JobCancellation), ConvertJobError> {
        let mut slot = self.slot.lock().map_err(|_| {
            ConvertJobError::new("worker_failed", "Conversion job state failed", job_id)
        })?;
        if slot.is_some() {
            return Err(ConvertJobError::new(
                "job_busy",
                "Another conversion is already running",
                job_id,
            ));
        }
        let cancel = JobCancellation::default();
        *slot = Some(ActiveConvertJob {
            job_id: job_id.into(),
            session_id: session_id.into(),
            cancel: cancel.clone(),
        });
        Ok((
            ConvertPermit {
                slot: Arc::clone(&self.slot),
            },
            cancel,
        ))
    }

    fn request_cancel(&self, job_id: &str) -> Result<ConvertJobSnapshot, ConvertJobError> {
        let slot = self.slot.lock().map_err(|_| {
            ConvertJobError::new("worker_failed", "Conversion job state failed", job_id)
        })?;
        let Some(job) = slot.as_ref() else {
            return Err(ConvertJobError::new(
                "job_not_running",
                "No conversion is running",
                job_id,
            ));
        };
        if job.job_id != job_id {
            return Err(ConvertJobError::new(
                "stale_job",
                "That conversion is no longer running",
                job_id,
            ));
        }
        job.cancel.request();
        Ok(Self::snapshot_locked(job))
    }

    #[cfg(test)]
    fn snapshot(&self, job_id: &str) -> Result<ConvertJobSnapshot, ConvertJobError> {
        let slot = self.slot.lock().map_err(|_| {
            ConvertJobError::new("worker_failed", "Conversion job state failed", job_id)
        })?;
        let Some(job) = slot.as_ref() else {
            return Err(ConvertJobError::new(
                "job_not_running",
                "No conversion is running",
                job_id,
            ));
        };
        if job.job_id != job_id {
            return Err(ConvertJobError::new(
                "stale_job",
                "That conversion is no longer running",
                job_id,
            ));
        }
        Ok(Self::snapshot_locked(job))
    }

    fn snapshot_locked(job: &ActiveConvertJob) -> ConvertJobSnapshot {
        ConvertJobSnapshot {
            job_id: job.job_id.clone(),
            session_id: job.session_id.clone(),
            state: if job.cancel.is_requested() {
                ConvertJobState::CancelRequested
            } else {
                ConvertJobState::Running
            },
        }
    }
}

fn validate_id(value: &str, label: &str, job_id: &str) -> Result<(), ConvertJobError> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ConvertJobError::new(
            "invalid_input",
            format!("Invalid {label}"),
            job_id,
        ));
    }
    Ok(())
}

fn validated_options(
    dto: ConvertOptionsDto,
    job_id: &str,
) -> Result<ConvertOptions, ConvertJobError> {
    let max_dimension = dto.max_dimension.unwrap_or(2048);
    if !(64..=4096).contains(&max_dimension)
        || !(1..=8).contains(&dto.color_precision)
        || dto.filter_speckle > 16
        || dto.splice_threshold > 180
        || dto.corner_threshold > 180
        || dto.path_precision > 4
        || !(0..=255).contains(&dto.layer_difference)
        || !matches!(dto.mode.as_str(), "spline" | "polygon" | "pixel")
        || !matches!(dto.hierarchical.as_str(), "stacked" | "cutout")
        || !matches!(
            dto.color_mode.as_deref().unwrap_or("color"),
            "color" | "binary"
        )
    {
        return Err(ConvertJobError::new(
            "invalid_input",
            "Conversion options are outside supported bounds",
            job_id,
        ));
    }
    Ok(ConvertOptions {
        color_precision: dto.color_precision,
        filter_speckle: dto.filter_speckle,
        splice_threshold: dto.splice_threshold,
        corner_threshold: dto.corner_threshold,
        path_precision: dto.path_precision,
        mode: dto.mode,
        hierarchical: dto.hierarchical,
        layer_difference: dto.layer_difference,
        max_dimension,
        color_mode: dto.color_mode.unwrap_or_else(|| "color".into()),
    })
}

fn validate_source(path: &Path, job_id: &str) -> Result<(), ConvertJobError> {
    let size = fs::metadata(path)
        .map_err(|error| ConvertJobError::new("source_unavailable", error.to_string(), job_id))?
        .len();
    if size > MAX_SOURCE_BYTES {
        return Err(ConvertJobError::new(
            "source_too_large",
            format!("Image is {size} bytes; limit is {MAX_SOURCE_BYTES}"),
            job_id,
        ));
    }
    let (width, height) = ImageReader::open(path)
        .and_then(|reader| reader.with_guessed_format())
        .map_err(|error| ConvertJobError::new("invalid_image", error.to_string(), job_id))?
        .into_dimensions()
        .map_err(|error| ConvertJobError::new("invalid_image", error.to_string(), job_id))?;
    if width > MAX_SOURCE_DIMENSION
        || height > MAX_SOURCE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_SOURCE_PIXELS
    {
        return Err(ConvertJobError::new(
            "source_dimensions_exceeded",
            format!("Image dimensions {width}x{height} exceed conversion limits"),
            job_id,
        ));
    }
    Ok(())
}

fn run_job(
    request: ConvertJobRequest,
    source_path: &Path,
    cancel: &JobCancellation,
) -> Result<ConvertJobResult, ConvertJobError> {
    validate_id(&request.job_id, "job ID", &request.job_id)?;
    validate_id(&request.session_id, "session ID", &request.job_id)?;
    cancel.checkpoint("decode", &request.job_id)?;
    validate_source(source_path, &request.job_id)?;
    let options = validated_options(request.options, &request.job_id)?;
    let svg = pipeline::convert_image_path_with_checkpoints(source_path, &options, |stage| {
        cancel
            .checkpoint(stage, &request.job_id)
            .map_err(|error| error.message)
    })
    .map_err(|message| {
        if cancel.is_requested() {
            ConvertJobError::new("cancelled", message, &request.job_id)
        } else {
            ConvertJobError::new("conversion_failed", message, &request.job_id)
        }
    })?;
    cancel.checkpoint("complete", &request.job_id)?;
    if svg.len() > MAX_OUTPUT_BYTES {
        return Err(ConvertJobError::new(
            "output_too_large",
            "Generated SVG exceeds the 32 MiB output limit",
            &request.job_id,
        ));
    }
    Ok(ConvertJobResult {
        job_id: request.job_id,
        session_id: request.session_id,
        source_revision: request.source_revision,
        svg,
    })
}

fn convert_stage(code: &str) -> &'static str {
    match code {
        "job_busy" => "queue",
        "invalid_input" | "source_not_authorized" | "stale_job" | "job_not_running" => "authorize",
        "source_unavailable"
        | "invalid_image"
        | "source_too_large"
        | "source_dimensions_exceeded" => "decode",
        "conversion_failed" => "trace",
        "output_too_large" => "output",
        "worker_failed" => "worker",
        "cancelled" => "cancel",
        "ok" => "complete",
        _ => "unknown",
    }
}

async fn convert_once(
    manager: State<'_, ConvertJobManager>,
    grants: State<'_, SourceGrantManager>,
    request: ConvertJobRequest,
) -> Result<ConvertJobResult, ConvertJobError> {
    validate_id(&request.job_id, "job ID", &request.job_id)?;
    validate_id(&request.session_id, "session ID", &request.job_id)?;
    let job_id = request.job_id.clone();
    let (permit, cancel) = manager.try_start(&job_id, &request.session_id)?;
    let source_path = grants
        .resolve(&request.source_grant_id)
        .map_err(|message| ConvertJobError::new("source_not_authorized", message, &job_id))?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        run_job(request, &source_path, &cancel)
    })
    .await
    .map_err(|error| ConvertJobError::new("worker_failed", error.to_string(), job_id))?
}

#[tauri::command]
pub fn cancel_convert_job(
    manager: State<'_, ConvertJobManager>,
    job_id: String,
) -> Result<ConvertJobSnapshot, ConvertJobError> {
    validate_id(&job_id, "job ID", &job_id)?;
    manager.request_cancel(&job_id)
}

#[tauri::command]
pub async fn convert_image_to_svg(
    manager: State<'_, ConvertJobManager>,
    grants: State<'_, SourceGrantManager>,
    log: State<'_, DiagnosticLog>,
    request: ConvertJobRequest,
) -> Result<ConvertJobResult, ConvertJobError> {
    let started = Instant::now();
    let job_id = request.job_id.clone();
    let session_id = request.session_id.clone();
    let result = convert_once(manager, grants, request).await;
    match &result {
        Ok(_) => log.record(
            DiagnosticLevel::Info,
            "ok",
            "convert",
            "Conversion succeeded",
            None,
            Some(&job_id),
            Some(&session_id),
            Some(convert_stage("ok")),
            Some(started.elapsed().as_millis() as u64),
        ),
        Err(error) if error.code == "cancelled" => log.record(
            DiagnosticLevel::Warn,
            error.code,
            "convert",
            &error.message,
            None,
            Some(&error.job_id),
            Some(&session_id),
            Some(convert_stage(error.code)),
            Some(started.elapsed().as_millis() as u64),
        ),
        Err(error) => log.record(
            DiagnosticLevel::Error,
            error.code,
            "convert",
            &error.message,
            None,
            Some(&error.job_id),
            Some(&session_id),
            Some(convert_stage(error.code)),
            Some(started.elapsed().as_millis() as u64),
        ),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{validated_options, ConvertJobManager, ConvertJobState, ConvertOptionsDto};

    #[test]
    fn permits_only_one_conversion_until_the_worker_finishes() {
        let manager = ConvertJobManager::default();
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
    fn cancel_keeps_the_slot_until_the_worker_exits() {
        let manager = ConvertJobManager::default();
        let (permit, cancel) = manager
            .try_start("job_1", "session_1")
            .expect("first job starts");
        assert_eq!(
            manager.snapshot("job_1").expect("running snapshot").state,
            ConvertJobState::Running
        );
        let snapshot = manager.request_cancel("job_1").expect("cancel requested");
        assert_eq!(snapshot.state, ConvertJobState::CancelRequested);
        assert!(cancel.is_requested());
        let error = match manager.try_start("job_2", "session_1") {
            Ok(_) => panic!("second job should still be rejected"),
            Err(error) => error,
        };
        assert_eq!(error.code, "job_busy");
        assert_eq!(
            manager.request_cancel("job_missing").unwrap_err().code,
            "stale_job"
        );
        drop(permit);
        assert_eq!(
            manager.request_cancel("job_missing").unwrap_err().code,
            "job_not_running"
        );
        assert!(manager.try_start("job_3", "session_1").is_ok());
    }

    #[test]
    fn rejects_trace_options_outside_supported_bounds() {
        let options = ConvertOptionsDto {
            color_precision: 0,
            filter_speckle: 4,
            splice_threshold: 45,
            corner_threshold: 60,
            path_precision: 2,
            mode: "spline".into(),
            hierarchical: "stacked".into(),
            layer_difference: 16,
            max_dimension: Some(2048),
            color_mode: Some("color".into()),
        };
        assert_eq!(
            validated_options(options, "job_1").unwrap_err().code,
            "invalid_input"
        );
    }
}
