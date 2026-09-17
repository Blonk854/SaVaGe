use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use super::destination_grants::DestinationGrantManager;

const GRANT_TTL: Duration = Duration::from_secs(30 * 60);
const DROP_TTL: Duration = Duration::from_secs(30);
const MAX_GRANTS: usize = 64;
const MAX_PENDING_DROPS: usize = 64;
const RASTER_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantedImageSource {
    pub path: String,
    pub grant_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSource {
    path: String,
    image_grant_id: Option<String>,
    project_destination_grant_id: Option<String>,
}

struct SourceGrant {
    path: PathBuf,
    expires_at: Instant,
}

#[derive(Default)]
struct SourceGrantState {
    grants: HashMap<String, SourceGrant>,
    pending_drops: HashMap<PathBuf, Instant>,
}

#[derive(Default)]
pub struct SourceGrantManager {
    state: Mutex<SourceGrantState>,
}

fn is_raster(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            RASTER_EXTENSIONS
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
}

fn canonical_raster(path: &Path) -> Result<PathBuf, String> {
    if !is_raster(path) {
        return Err("Selected file is not a supported raster image".into());
    }
    path.canonicalize()
        .map_err(|error| format!("Unable to authorize image source: {error}"))
}

impl SourceGrantManager {
    fn prune(state: &mut SourceGrantState, now: Instant) {
        state.grants.retain(|_, grant| grant.expires_at > now);
        state
            .pending_drops
            .retain(|_, expires_at| *expires_at > now);
    }

    fn issue_canonical(
        state: &mut SourceGrantState,
        path: PathBuf,
        now: Instant,
    ) -> Result<GrantedImageSource, String> {
        Self::prune(state, now);
        if state.grants.len() >= MAX_GRANTS {
            return Err("Too many image sources are currently authorized".into());
        }
        let grant_id = Uuid::new_v4().to_string();
        state.grants.insert(
            grant_id.clone(),
            SourceGrant {
                path: path.clone(),
                expires_at: now + GRANT_TTL,
            },
        );
        Ok(GrantedImageSource {
            path: path.to_string_lossy().into_owned(),
            grant_id,
        })
    }

    pub fn issue(&self, path: &Path) -> Result<GrantedImageSource, String> {
        let path = canonical_raster(path)?;
        let mut state = self.state.lock().map_err(|_| "Source grant state failed")?;
        Self::issue_canonical(&mut state, path, Instant::now())
    }

    pub fn observe_drop(&self, paths: &[PathBuf]) {
        let now = Instant::now();
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        Self::prune(&mut state, now);
        for path in paths {
            if state.pending_drops.len() >= MAX_PENDING_DROPS {
                break;
            }
            if let Ok(path) = canonical_raster(path) {
                state.pending_drops.insert(path, now + DROP_TTL);
            }
        }
    }

    fn claim_drop(&self, path: &Path) -> Result<GrantedImageSource, String> {
        let path = canonical_raster(path)?;
        let now = Instant::now();
        let mut state = self.state.lock().map_err(|_| "Source grant state failed")?;
        Self::prune(&mut state, now);
        if state.pending_drops.remove(&path).is_none() {
            return Err("Image path was not supplied by a recent native drop".into());
        }
        Self::issue_canonical(&mut state, path, now)
    }

    pub fn resolve(&self, grant_id: &str) -> Result<PathBuf, String> {
        let now = Instant::now();
        let mut state = self.state.lock().map_err(|_| "Source grant state failed")?;
        Self::prune(&mut state, now);
        state
            .grants
            .get(grant_id)
            .map(|grant| grant.path.clone())
            .ok_or_else(|| "Image source grant is missing or expired".into())
    }

    /// One-shot take of an authorized path. Conversion uses `resolve` so cancel and retry
    /// can reuse the grant; this remains the consume-once primitive for tests.
    #[allow(dead_code)]
    pub fn consume(&self, grant_id: &str) -> Result<PathBuf, String> {
        let now = Instant::now();
        let mut state = self.state.lock().map_err(|_| "Source grant state failed")?;
        Self::prune(&mut state, now);
        state
            .grants
            .remove(grant_id)
            .map(|grant| grant.path)
            .ok_or_else(|| "Image source grant is missing, expired, or already used".into())
    }
}

#[tauri::command]
pub async fn pick_image_source(
    app: AppHandle,
    grants: State<'_, SourceGrantManager>,
) -> Result<Option<GrantedImageSource>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Images", RASTER_EXTENSIONS)
        .blocking_pick_file();
    selected
        .map(|file| {
            file.into_path()
                .map_err(|error| error.to_string())
                .and_then(|path| grants.issue(&path))
        })
        .transpose()
}

#[tauri::command]
pub async fn pick_open_source(
    app: AppHandle,
    grants: State<'_, SourceGrantManager>,
    destinations: State<'_, DestinationGrantManager>,
) -> Result<Option<OpenSource>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter(
            "SaVaGe / SVG / Images",
            &[
                "savage", "svg", "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff",
            ],
        )
        .blocking_pick_file();
    selected
        .map(|file| {
            let path = file.into_path().map_err(|error| error.to_string())?;
            let image_grant_id = if is_raster(&path) {
                Some(grants.issue(&path)?.grant_id)
            } else {
                None
            };
            let project_destination_grant_id = path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("savage"))
                .then(|| destinations.issue_project(&path))
                .transpose()?
                .map(|grant| grant.grant_id);
            Ok(OpenSource {
                path: path.to_string_lossy().into_owned(),
                image_grant_id,
                project_destination_grant_id,
            })
        })
        .transpose()
}

#[tauri::command]
pub fn claim_dropped_image(
    grants: State<'_, SourceGrantManager>,
    path: String,
) -> Result<GrantedImageSource, String> {
    grants.claim_drop(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::SourceGrantManager;

    #[test]
    fn dropped_paths_require_native_observation_and_issue_bounded_grants() {
        let path = std::env::temp_dir().join(format!(
            "savage-grant-{}-{}.png",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::write(&path, b"fixture").expect("write fixture");
        let manager = SourceGrantManager::default();

        assert!(manager.claim_drop(&path).is_err());
        manager.observe_drop(std::slice::from_ref(&path));
        let granted = manager.claim_drop(&path).expect("observed drop is granted");
        assert_eq!(
            manager.resolve(&granted.grant_id).unwrap(),
            path.canonicalize().unwrap()
        );
        assert_eq!(
            manager.consume(&granted.grant_id).unwrap(),
            path.canonicalize().unwrap()
        );
        assert!(manager.resolve(&granted.grant_id).is_err());
        assert!(manager.claim_drop(&path).is_err());

        let _ = fs::remove_file(path);
    }
}
