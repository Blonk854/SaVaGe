use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use tauri::State;

use super::destination_grants::DestinationGrantManager;
use super::diagnostics::{DiagnosticLevel, DiagnosticLog};
use super::file_identity::{fingerprint, FileFingerprint};

const MAX_TEXT_OUTPUT_BYTES: usize = 32 * 1024 * 1024;
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
pub fn write_svg_export(
    grants: State<'_, DestinationGrantManager>,
    log: State<'_, DiagnosticLog>,
    destination_grant_id: String,
    contents: String,
) -> Result<(), String> {
    let path = grants.consume_svg(&destination_grant_id)?;
    write_text_file_atomic(&path, contents.as_bytes(), MAX_TEXT_OUTPUT_BYTES, None)
        .map(|_| ())
        .inspect_err(|message| {
            log.record(
                DiagnosticLevel::Error,
                "export_failed",
                "export",
                message,
                None,
                None,
                None,
                Some("write"),
                None,
            );
        })
}

#[tauri::command]
pub fn export_png(
    grants: State<'_, DestinationGrantManager>,
    log: State<'_, DiagnosticLog>,
    destination_grant_id: String,
    svg: String,
    scale: Option<f32>,
) -> Result<(), String> {
    let path = grants.consume_png(&destination_grant_id)?;
    let result = (|| {
        let scale = scale.unwrap_or(1.0).clamp(0.25, 8.0);
        let opt = Options::default();
        let tree = Tree::from_str(&svg, &opt).map_err(|e| format!("Invalid SVG: {e}"))?;
        let size = tree.size();
        let width = (size.width() * scale).round().max(1.0) as u32;
        let height = (size.height() * scale).round().max(1.0) as u32;

        let mut pixmap = Pixmap::new(width, height)
            .ok_or_else(|| "Failed to allocate PNG pixmap".to_string())?;
        let transform = Transform::from_scale(scale, scale);
        resvg::render(&tree, transform, &mut pixmap.as_mut());

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        pixmap
            .save_png(&path)
            .map_err(|e| format!("Failed to write PNG {}: {e}", path.display()))?;
        Ok(())
    })();
    if let Err(message) = &result {
        log.record(
            DiagnosticLevel::Error,
            "export_failed",
            "export",
            message,
            None,
            None,
            None,
            Some("render"),
            None,
        );
    }
    result
}

#[cfg(test)]
mod tests {
    use super::write_text_file_atomic;
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
}
