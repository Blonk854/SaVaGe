use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use super::destination_grants::{pick_destination, DestinationGrantManager, DestinationKind};
use super::export::write_text_file_atomic;

const DIAGNOSTIC_FORMAT_VERSION: u32 = 1;
const MAX_EVENTS: usize = 128;
const MAX_MESSAGE_CHARS: usize = 400;
const MAX_EXPORT_BYTES: usize = 256 * 1024;
const APPLICATION_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticLevel {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    timestamp_ms: u64,
    level: DiagnosticLevel,
    code: String,
    operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    operation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    job_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elapsed_ms: Option<u64>,
    message: String,
    application_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecordRequest {
    level: DiagnosticLevel,
    code: String,
    operation: String,
    #[serde(default)]
    operation_id: Option<String>,
    #[serde(default)]
    job_id: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    elapsed_ms: Option<u64>,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticExport {
    format_version: u32,
    application_version: String,
    exported_at_ms: u64,
    notice: String,
    events: Vec<DiagnosticEvent>,
}

struct Inner {
    events: VecDeque<DiagnosticEvent>,
    persist_path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct DiagnosticLog {
    inner: Arc<Mutex<Inner>>,
}

impl Default for DiagnosticLog {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                events: VecDeque::new(),
                persist_path: None,
            })),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

fn validate_token(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return None;
    }
    Some(value.to_string())
}

fn sanitize_operation(value: &str) -> String {
    match value {
        "convert" | "save" | "open" | "export" | "recovery" | "plugin" | "help" | "boolean"
        | "preview" | "session" => value.to_string(),
        _ => "other".into(),
    }
}

fn sanitize_code(value: &str) -> String {
    validate_token(Some(value)).unwrap_or_else(|| "invalid_code".into())
}

fn looks_like_document(text: &str) -> bool {
    (text.contains("\"nodes\"") && text.contains("\"rootChildIds\""))
        || (text.contains("<svg") && text.len() > 80)
        || (text.contains("\"contents\"") && text.contains("\"subpaths\""))
}

fn consume_until_separator(input: &str) -> usize {
    input
        .char_indices()
        .find(|(_, ch)| ch.is_whitespace() || matches!(ch, '"' | '\'' | ',' | ')' | ']' | '>'))
        .map(|(index, _)| index)
        .unwrap_or(input.len())
}

fn consume_uri(input: &str) -> usize {
    input
        .char_indices()
        .find(|(_, ch)| ch.is_whitespace() || matches!(ch, '"' | '\'' | ')' | ']' | '>'))
        .map(|(index, _)| index)
        .unwrap_or(input.len())
}

fn take_sensitive(input: &str) -> Option<(usize, &'static str)> {
    let lowered: String = input
        .chars()
        .take(5)
        .collect::<String>()
        .to_ascii_lowercase();
    if lowered == "data:" {
        return Some((consume_uri(input), "<data>"));
    }
    if lowered == "file:" {
        return Some((consume_uri(input), "<path>"));
    }
    let bytes = input.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return Some((consume_until_separator(input), "<path>"));
    }
    if input.starts_with("\\\\") || input.starts_with("//") {
        return Some((consume_until_separator(input), "<path>"));
    }
    for prefix in ["/Users/", "/home/", "/tmp/", "/var/", "/private/", "/opt/"] {
        if input.starts_with(prefix) {
            return Some((consume_until_separator(input), "<path>"));
        }
    }
    None
}

fn redact_long_data(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut token = String::new();
    let flush_token = |token: &mut String, output: &mut String| {
        if token.len() > 80
            && token
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '-'))
        {
            output.push_str("<data>");
        } else {
            output.push_str(token);
        }
        token.clear();
    };
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '-') {
            token.push(ch);
        } else {
            flush_token(&mut token, &mut output);
            output.push(ch);
        }
    }
    flush_token(&mut token, &mut output);
    output
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    let mut output = input.chars().take(max_chars).collect::<String>();
    if input.chars().count() > max_chars {
        output.push('…');
    }
    output
}

pub fn redact_user_text(input: &str) -> String {
    if looks_like_document(input) {
        return "<omitted-document>".into();
    }
    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    while !rest.is_empty() {
        if let Some((taken, replacement)) = take_sensitive(rest) {
            output.push_str(replacement);
            rest = &rest[taken..];
        } else {
            let mut chars = rest.chars();
            if let Some(ch) = chars.next() {
                output.push(ch);
                rest = chars.as_str();
            }
        }
    }
    truncate_chars(&redact_long_data(&output), MAX_MESSAGE_CHARS)
}

impl DiagnosticLog {
    pub fn attach(&self, app: &AppHandle) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        let Ok(directory) = app.path().app_data_dir() else {
            return;
        };
        let path = directory.join("diagnostics.json");
        if path.is_file() {
            if let Ok(bytes) = std::fs::read(&path) {
                if bytes.len() <= MAX_EXPORT_BYTES {
                    if let Ok(exported) = serde_json::from_slice::<DiagnosticExport>(&bytes) {
                        if exported.format_version == DIAGNOSTIC_FORMAT_VERSION {
                            inner.events = exported
                                .events
                                .into_iter()
                                .rev()
                                .take(MAX_EVENTS)
                                .rev()
                                .collect();
                        }
                    }
                }
            }
        }
        inner.persist_path = Some(path);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record(
        &self,
        level: DiagnosticLevel,
        code: &str,
        operation: &str,
        message: impl AsRef<str>,
        operation_id: Option<&str>,
        job_id: Option<&str>,
        session_id: Option<&str>,
        stage: Option<&str>,
        elapsed_ms: Option<u64>,
    ) {
        let event = DiagnosticEvent {
            timestamp_ms: now_ms(),
            level,
            code: sanitize_code(code),
            operation: sanitize_operation(operation),
            operation_id: validate_token(operation_id),
            job_id: validate_token(job_id),
            session_id: validate_token(session_id),
            stage: validate_token(stage),
            elapsed_ms,
            message: redact_user_text(message.as_ref()),
            application_version: APPLICATION_VERSION.into(),
        };
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.events.push_back(event);
        while inner.events.len() > MAX_EVENTS {
            inner.events.pop_front();
        }
        let persist_path = inner.persist_path.clone();
        let events = inner.events.iter().cloned().collect::<Vec<_>>();
        drop(inner);
        if let Some(path) = persist_path {
            if let Ok(payload) = encode_export(events) {
                let _ = write_text_file_atomic(&path, payload.as_bytes(), MAX_EXPORT_BYTES, None);
            }
        }
    }

    fn snapshot_events(&self) -> Vec<DiagnosticEvent> {
        self.inner
            .lock()
            .map(|inner| inner.events.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn export_json(&self) -> Result<String, String> {
        encode_export(self.snapshot_events())
    }
}

fn encode_export(mut events: Vec<DiagnosticEvent>) -> Result<String, String> {
    loop {
        let payload = DiagnosticExport {
            format_version: DIAGNOSTIC_FORMAT_VERSION,
            application_version: APPLICATION_VERSION.into(),
            exported_at_ms: now_ms(),
            notice: "Redacted diagnostic log. It does not include documents, embedded assets, secrets, or full file paths.".into(),
            events: events.clone(),
        };
        let json = serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("Could not encode diagnostics: {error}"))?;
        if json.len() <= MAX_EXPORT_BYTES {
            return Ok(json);
        }
        if events.is_empty() {
            return Err("Diagnostics export exceeded the size bound".into());
        }
        events.remove(0);
    }
}

#[tauri::command]
pub fn record_diagnostic(log: State<'_, DiagnosticLog>, request: DiagnosticRecordRequest) {
    log.record(
        request.level,
        &request.code,
        &request.operation,
        request.message,
        request.operation_id.as_deref(),
        request.job_id.as_deref(),
        request.session_id.as_deref(),
        request.stage.as_deref(),
        request.elapsed_ms,
    );
}

#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle,
    log: State<'_, DiagnosticLog>,
    grants: State<'_, DestinationGrantManager>,
) -> Result<Option<String>, String> {
    let granted = match pick_destination(
        &app,
        &grants,
        DestinationKind::Diagnostics,
        "savage-diagnostics.json",
    )? {
        Some(granted) => granted,
        None => return Ok(None),
    };
    let path = grants.consume_diagnostics(&granted.grant_id)?;
    let payload = log.export_json()?;
    write_text_file_atomic(&path, payload.as_bytes(), MAX_EXPORT_BYTES, None)?;
    Ok(Some(granted.path))
}

#[cfg(test)]
mod tests {
    use super::{redact_user_text, DiagnosticLevel, DiagnosticLog, MAX_EVENTS};

    #[test]
    fn redacts_paths_documents_and_embedded_data() {
        assert_eq!(
            redact_user_text(r#"Failed to replace C:\Users\sawyers\poster.savage"#),
            "Failed to replace <path>"
        );
        assert_eq!(
            redact_user_text("Could not read /Users/sawyers/art.svg"),
            "Could not read <path>"
        );
        assert_eq!(
            redact_user_text("preview data:image/png;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM="),
            "preview <data>"
        );
        assert_eq!(
            redact_user_text(r#"{"version":1,"nodes":{"a":{"id":"a"}},"rootChildIds":["a"]}"#),
            "<omitted-document>"
        );
        let long = "A".repeat(120);
        assert_eq!(redact_user_text(&format!("token {long}")), "token <data>");
    }

    #[test]
    fn bounds_the_ring_and_omits_sensitive_fields_from_export() {
        let log = DiagnosticLog::default();
        for index in 0..MAX_EVENTS + 25 {
            log.record(
                DiagnosticLevel::Error,
                "save_failed",
                "save",
                format!(r#"write failed for C:\Users\sawyers\file-{index}.savage"#),
                Some("op_1"),
                None,
                Some("session_1"),
                Some("replace"),
                Some(12),
            );
        }
        let json = log.export_json().expect("encode diagnostics");
        assert!(!json.contains(r"C:\Users"));
        assert!(!json.contains("sawyers"));
        assert!(json.contains("<path>"));
        assert!(json.contains("save_failed"));
        assert!(json.contains("session_1"));
        assert!(json.contains("Redacted diagnostic log"));
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("json");
        assert_eq!(
            parsed["events"].as_array().expect("events").len(),
            MAX_EVENTS
        );
    }
}
