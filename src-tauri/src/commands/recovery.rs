use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use super::diagnostics::{DiagnosticLevel, DiagnosticLog};
use super::export::write_text_file_atomic;
use super::file_identity::FileFingerprint;

const RECOVERY_FORMAT_VERSION: u32 = 1;
const RECOVERY_SUBDIR: &str = "recovery";
const PROJECT_SCHEMA_VERSION: u32 = 1;
const MAX_RECOVERY_BYTES: usize = 32 * 1024 * 1024;
const MAX_AGGREGATE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_RECOVERY_FILES: usize = 64;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryWriteRequest {
    session_id: String,
    source_path: Option<String>,
    source_fingerprint: Option<FileFingerprint>,
    schema_version: u32,
    sequence: u64,
    contents: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEnvelope {
    format_version: u32,
    application_version: String,
    schema_version: u32,
    session_id: String,
    source_path: Option<String>,
    source_fingerprint: Option<FileFingerprint>,
    sequence: u64,
    created_at_ms: u64,
    contents: String,
    integrity: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryIssue {
    file_name: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryScan {
    candidates: Vec<RecoveryEnvelope>,
    issues: Vec<RecoveryIssue>,
}

fn recovery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(RECOVERY_SUBDIR))
        .map_err(|error| format!("Could not resolve recovery directory: {error}"))
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    if session_id.is_empty()
        || session_id.len() > 64
        || !session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Invalid recovery session ID".into());
    }
    Ok(())
}

fn envelope_integrity(envelope: &RecoveryEnvelope) -> Result<String, String> {
    let identity = serde_json::to_vec(&(
        envelope.format_version,
        &envelope.application_version,
        envelope.schema_version,
        &envelope.session_id,
        &envelope.source_path,
        &envelope.source_fingerprint,
        envelope.sequence,
        envelope.created_at_ms,
        &envelope.contents,
    ))
    .map_err(|error| format!("Could not encode recovery integrity data: {error}"))?;
    Ok(format!("{:x}", Sha256::digest(identity)))
}

fn recovery_path(directory: &Path, session_id: &str) -> Result<PathBuf, String> {
    validate_session_id(session_id)?;
    Ok(directory.join(format!("{session_id}.recovery.json")))
}

fn peek_recovery_versions(path: &Path) -> Option<(u32, Option<u32>)> {
    let bytes = fs::read(path).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let format = value.get("formatVersion")?.as_u64()? as u32;
    let schema = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .map(|value| value as u32);
    Some((format, schema))
}

fn unsupported_recovery_reason(format: u32, schema: Option<u32>) -> Option<String> {
    if format != RECOVERY_FORMAT_VERSION {
        return Some(format!(
            "Unsupported recovery format version {format}; the file was left unchanged"
        ));
    }
    if let Some(schema) = schema {
        if schema != PROJECT_SCHEMA_VERSION {
            return Some(format!(
                "Unsupported project schema version {schema}; the file was left unchanged"
            ));
        }
    }
    None
}

fn read_envelope(path: &Path) -> Result<RecoveryEnvelope, String> {
    let bytes = fs::read(path).map_err(|error| format!("Could not read recovery: {error}"))?;
    if bytes.len() > MAX_RECOVERY_BYTES {
        return Err("Recovery exceeds the per-session size limit".into());
    }
    let envelope: RecoveryEnvelope = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Recovery JSON is invalid: {error}"))?;
    validate_session_id(&envelope.session_id)?;
    if envelope.format_version != RECOVERY_FORMAT_VERSION {
        return Err(format!(
            "Unsupported recovery format version {}",
            envelope.format_version
        ));
    }
    if envelope.schema_version != PROJECT_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported project schema version {}",
            envelope.schema_version
        ));
    }
    if envelope.integrity != envelope_integrity(&envelope)? {
        return Err("Recovery integrity check failed".into());
    }
    Ok(envelope)
}

fn scan_directory(directory: &Path) -> RecoveryScan {
    let mut candidates = Vec::new();
    let mut issues = Vec::new();
    let Ok(entries) = fs::read_dir(directory) else {
        return RecoveryScan { candidates, issues };
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        match read_envelope(&path) {
            Ok(envelope) => candidates.push(envelope),
            Err(reason) => {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                if let Some((format, schema)) = peek_recovery_versions(&path) {
                    if let Some(unsupported) = unsupported_recovery_reason(format, schema) {
                        issues.push(RecoveryIssue {
                            file_name,
                            reason: unsupported,
                        });
                        continue;
                    }
                }
                let quarantine = path.with_extension("quarantine");
                let quarantine_note = match fs::rename(&path, &quarantine) {
                    Ok(()) => " The file was quarantined.".to_string(),
                    Err(error) => format!(" Quarantine failed: {error}"),
                };
                issues.push(RecoveryIssue {
                    file_name,
                    reason: format!("{reason}{quarantine_note}"),
                });
            }
        }
    }
    candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.created_at_ms));
    RecoveryScan { candidates, issues }
}

fn write_recovery_to(directory: &Path, request: RecoveryWriteRequest) -> Result<(), String> {
    validate_session_id(&request.session_id)?;
    if request.contents.len() > MAX_RECOVERY_BYTES {
        return Err("Recovery exceeds the per-session size limit".into());
    }
    fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create recovery directory: {error}"))?;
    let destination = recovery_path(directory, &request.session_id)?;
    if destination.exists() {
        if let Some((format, schema)) = peek_recovery_versions(&destination) {
            if let Some(reason) = unsupported_recovery_reason(format, schema) {
                return Err(reason);
            }
        }
    }
    if let Ok(existing) = read_envelope(&destination) {
        if request.sequence <= existing.sequence {
            return Ok(());
        }
    }
    let created_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?
        .as_millis() as u64;
    let mut envelope = RecoveryEnvelope {
        format_version: RECOVERY_FORMAT_VERSION,
        application_version: env!("CARGO_PKG_VERSION").into(),
        schema_version: request.schema_version,
        session_id: request.session_id,
        source_path: request.source_path,
        source_fingerprint: request.source_fingerprint,
        sequence: request.sequence,
        created_at_ms,
        contents: request.contents,
        integrity: String::new(),
    };
    envelope.integrity = envelope_integrity(&envelope)?;
    let encoded = serde_json::to_vec(&envelope)
        .map_err(|error| format!("Could not encode recovery: {error}"))?;
    if encoded.len() > MAX_RECOVERY_BYTES {
        return Err("Recovery exceeds the per-session size limit".into());
    }

    let scan = scan_directory(directory);
    let existing_size = fs::metadata(&destination)
        .map(|value| value.len())
        .unwrap_or(0);
    let aggregate_size = scan
        .candidates
        .iter()
        .filter_map(|candidate| {
            recovery_path(directory, &candidate.session_id)
                .ok()
                .and_then(|path| fs::metadata(path).ok())
                .map(|value| value.len())
        })
        .sum::<u64>();
    if !destination.exists() && scan.candidates.len() >= MAX_RECOVERY_FILES {
        return Err("Recovery file budget is full; existing recoveries were preserved".into());
    }
    if aggregate_size.saturating_sub(existing_size) + encoded.len() as u64 > MAX_AGGREGATE_BYTES {
        return Err("Recovery disk budget is full; existing recoveries were preserved".into());
    }
    write_text_file_atomic(&destination, &encoded, MAX_RECOVERY_BYTES, None).map(|_| ())
}

fn delete_recovery_from(
    directory: &Path,
    session_id: &str,
    through_sequence: u64,
) -> Result<bool, String> {
    let path = recovery_path(directory, session_id)?;
    if !path.exists() {
        return Ok(false);
    }
    let envelope = read_envelope(&path)?;
    if envelope.sequence > through_sequence {
        return Ok(false);
    }
    fs::remove_file(path).map_err(|error| format!("Could not remove recovery: {error}"))?;
    Ok(true)
}

#[tauri::command]
pub async fn write_recovery(
    app: AppHandle,
    log: State<'_, DiagnosticLog>,
    request: RecoveryWriteRequest,
) -> Result<(), String> {
    let directory = recovery_dir(&app)?;
    let session_id = request.session_id.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || write_recovery_to(&directory, request))
            .await
            .map_err(|error| format!("Recovery worker failed: {error}"))?;
    if let Err(message) = &result {
        log.record(
            DiagnosticLevel::Error,
            "recovery_failed",
            "recovery",
            message,
            None,
            None,
            Some(&session_id),
            Some("write"),
            None,
        );
    }
    result
}

#[tauri::command]
pub async fn list_recoveries(app: AppHandle) -> Result<RecoveryScan, String> {
    let directory = recovery_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || scan_directory(&directory))
        .await
        .map_err(|error| format!("Recovery worker failed: {error}"))
}

#[tauri::command]
pub async fn delete_recovery(
    app: AppHandle,
    session_id: String,
    through_sequence: u64,
) -> Result<bool, String> {
    let directory = recovery_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        delete_recovery_from(&directory, &session_id, through_sequence)
    })
    .await
    .map_err(|error| format!("Recovery worker failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        delete_recovery_from, read_envelope, scan_directory, write_recovery_to,
        RecoveryWriteRequest, RECOVERY_SUBDIR,
    };
    use std::fs;

    #[test]
    fn recovery_is_atomic_validated_and_sequence_aware() {
        let directory = std::env::temp_dir().join(format!(
            "savage-recovery-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let request = |sequence, contents: &str| RecoveryWriteRequest {
            session_id: "session_1".into(),
            source_path: None,
            source_fingerprint: None,
            schema_version: 1,
            sequence,
            contents: contents.into(),
        };

        write_recovery_to(&directory, request(2, "newer")).expect("write recovery");
        write_recovery_to(&directory, request(1, "older")).expect("ignore stale write");
        let path = directory.join("session_1.recovery.json");
        assert_eq!(
            read_envelope(&path).expect("valid envelope").contents,
            "newer"
        );
        assert!(!delete_recovery_from(&directory, "session_1", 1).expect("preserve newer"));

        fs::write(&path, b"corrupt").expect("corrupt recovery");
        let scan = scan_directory(&directory);
        assert!(scan.candidates.is_empty());
        assert_eq!(scan.issues.len(), 1);
        assert!(scan.issues[0].reason.contains("quarantined"));
        assert!(!path.exists());
        assert_eq!(RECOVERY_SUBDIR, "recovery");
        fs::remove_dir_all(directory).expect("cleanup recovery test");
    }

    #[test]
    fn unsupported_recovery_versions_are_left_unchanged() {
        let directory = std::env::temp_dir().join(format!(
            "savage-recovery-future-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create recovery directory");
        let path = directory.join("session_x.recovery.json");
        let original = r#"{"formatVersion":2,"applicationVersion":"9.0.0","schemaVersion":2,"sessionId":"session_x","sequence":3,"createdAtMs":1,"contents":"{}","integrity":"deadbeef"}"#;
        fs::write(&path, original).expect("seed future recovery");

        let scan = scan_directory(&directory);
        assert!(scan.candidates.is_empty());
        assert_eq!(scan.issues.len(), 1);
        assert!(scan.issues[0]
            .reason
            .contains("Unsupported recovery format version 2"));
        assert!(!scan.issues[0].reason.contains("quarantined"));
        assert_eq!(
            fs::read_to_string(&path).expect("preserved bytes"),
            original
        );

        let error = write_recovery_to(
            &directory,
            RecoveryWriteRequest {
                session_id: "session_x".into(),
                source_path: None,
                source_fingerprint: None,
                schema_version: 1,
                sequence: 99,
                contents: "new".into(),
            },
        )
        .expect_err("must not overwrite future recovery");
        assert!(error.contains("Unsupported"));
        assert_eq!(
            fs::read_to_string(&path).expect("still preserved"),
            original
        );
        fs::remove_dir_all(directory).expect("cleanup future recovery test");
    }
}
