use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const GRANT_TTL: Duration = Duration::from_secs(8 * 60 * 60);
const MAX_GRANTS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DestinationKind {
    Project,
    Svg,
    Png,
    Diagnostics,
}

impl DestinationKind {
    fn extension(self) -> &'static str {
        match self {
            Self::Project => "savage",
            Self::Svg => "svg",
            Self::Png => "png",
            Self::Diagnostics => "json",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Project => "SaVaGe Project",
            Self::Svg => "SVG",
            Self::Png => "PNG",
            Self::Diagnostics => "Diagnostics",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantedDestination {
    pub path: String,
    pub grant_id: String,
}

struct DestinationGrant {
    path: PathBuf,
    kind: DestinationKind,
    expires_at: Instant,
}

#[derive(Default)]
pub struct DestinationGrantManager {
    grants: Mutex<HashMap<String, DestinationGrant>>,
}

fn validate_default_name(name: &str, kind: DestinationKind) -> Result<(), String> {
    let path = Path::new(name);
    if name.is_empty()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err("Default file name must not contain a path".into());
    }
    validate_extension(path, kind)
}

fn validate_extension(path: &Path, kind: DestinationKind) -> Result<(), String> {
    let matches = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(kind.extension()));
    if matches {
        Ok(())
    } else {
        Err(format!("Destination must use .{}", kind.extension()))
    }
}

fn normalize_destination(path: &Path, kind: DestinationKind) -> Result<PathBuf, String> {
    validate_extension(path, kind)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Destination has no file name".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Destination has no parent directory".to_string())?
        .canonicalize()
        .map_err(|error| format!("Unable to authorize destination directory: {error}"))?;
    Ok(parent.join(file_name))
}

impl DestinationGrantManager {
    fn issue(&self, path: &Path, kind: DestinationKind) -> Result<GrantedDestination, String> {
        let path = normalize_destination(path, kind)?;
        let now = Instant::now();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Destination grant state failed")?;
        grants.retain(|_, grant| grant.expires_at > now);
        if grants.len() >= MAX_GRANTS {
            return Err("Too many destinations are currently authorized".into());
        }
        let grant_id = Uuid::new_v4().to_string();
        grants.insert(
            grant_id.clone(),
            DestinationGrant {
                path: path.clone(),
                kind,
                expires_at: now + GRANT_TTL,
            },
        );
        Ok(GrantedDestination {
            path: path.to_string_lossy().into_owned(),
            grant_id,
        })
    }

    pub fn issue_project(&self, path: &Path) -> Result<GrantedDestination, String> {
        self.issue(path, DestinationKind::Project)
    }

    pub fn resolve_project(&self, grant_id: &str) -> Result<PathBuf, String> {
        self.resolve(grant_id, DestinationKind::Project, false)
    }

    pub fn consume_svg(&self, grant_id: &str) -> Result<PathBuf, String> {
        self.resolve(grant_id, DestinationKind::Svg, true)
    }

    pub fn consume_png(&self, grant_id: &str) -> Result<PathBuf, String> {
        self.resolve(grant_id, DestinationKind::Png, true)
    }

    pub fn consume_diagnostics(&self, grant_id: &str) -> Result<PathBuf, String> {
        self.resolve(grant_id, DestinationKind::Diagnostics, true)
    }

    fn resolve(
        &self,
        grant_id: &str,
        expected_kind: DestinationKind,
        consume: bool,
    ) -> Result<PathBuf, String> {
        let now = Instant::now();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Destination grant state failed")?;
        grants.retain(|_, grant| grant.expires_at > now);
        let grant = grants
            .get(grant_id)
            .ok_or_else(|| "Destination grant is missing or expired".to_string())?;
        if grant.kind != expected_kind {
            return Err("Destination grant is not valid for this operation".into());
        }
        let path = grant.path.clone();
        if consume {
            grants.remove(grant_id);
        }
        Ok(path)
    }
}

pub(crate) fn pick_destination(
    app: &AppHandle,
    grants: &DestinationGrantManager,
    kind: DestinationKind,
    default_file_name: &str,
) -> Result<Option<GrantedDestination>, String> {
    validate_default_name(default_file_name, kind)?;
    app.dialog()
        .file()
        .add_filter(kind.label(), &[kind.extension()])
        .set_file_name(default_file_name)
        .blocking_save_file()
        .map(|file| {
            file.into_path()
                .map_err(|error| error.to_string())
                .and_then(|path| grants.issue(&path, kind))
        })
        .transpose()
}

#[tauri::command]
pub async fn pick_project_destination(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
    default_file_name: String,
) -> Result<Option<GrantedDestination>, String> {
    pick_destination(&app, &grants, DestinationKind::Project, &default_file_name)
}

#[tauri::command]
pub async fn pick_svg_destination(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
    default_file_name: String,
) -> Result<Option<GrantedDestination>, String> {
    pick_destination(&app, &grants, DestinationKind::Svg, &default_file_name)
}

#[tauri::command]
pub async fn pick_png_destination(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
    default_file_name: String,
) -> Result<Option<GrantedDestination>, String> {
    pick_destination(&app, &grants, DestinationKind::Png, &default_file_name)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{validate_default_name, DestinationGrantManager, DestinationKind, MAX_GRANTS};

    #[test]
    fn grants_are_operation_scoped_and_exports_are_one_shot() {
        let directory = std::env::temp_dir().join(format!(
            "savage-destination-grant-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create destination directory");
        let manager = DestinationGrantManager::default();
        let project = manager
            .issue(&directory.join("poster.savage"), DestinationKind::Project)
            .expect("issue project grant");
        let svg = manager
            .issue(&directory.join("poster.svg"), DestinationKind::Svg)
            .expect("issue svg grant");
        let png = manager
            .issue(&directory.join("poster.png"), DestinationKind::Png)
            .expect("issue png grant");
        let diagnostics = manager
            .issue(
                &directory.join("savage-diagnostics.json"),
                DestinationKind::Diagnostics,
            )
            .expect("issue diagnostics grant");

        assert!(manager.resolve_project("unknown").is_err());
        assert!(manager.consume_svg(&project.grant_id).is_err());
        assert_eq!(
            manager.resolve_project(&project.grant_id).unwrap(),
            directory.canonicalize().unwrap().join("poster.savage")
        );
        assert_eq!(
            manager.resolve_project(&project.grant_id).unwrap(),
            directory.canonicalize().unwrap().join("poster.savage")
        );
        assert!(manager
            .issue(&directory.join("poster.txt"), DestinationKind::Project)
            .is_err());
        assert_eq!(
            manager.consume_svg(&svg.grant_id).unwrap(),
            directory.canonicalize().unwrap().join("poster.svg")
        );
        assert!(manager.consume_svg(&svg.grant_id).is_err());
        assert_eq!(
            manager.consume_png(&png.grant_id).unwrap(),
            directory.canonicalize().unwrap().join("poster.png")
        );
        assert!(manager.consume_png(&png.grant_id).is_err());
        assert_eq!(
            manager.consume_diagnostics(&diagnostics.grant_id).unwrap(),
            directory
                .canonicalize()
                .unwrap()
                .join("savage-diagnostics.json")
        );
        assert!(manager.consume_diagnostics(&diagnostics.grant_id).is_err());

        fs::remove_dir_all(directory).expect("remove destination directory");
    }

    #[test]
    fn default_names_and_unknown_grants_cannot_authorize_a_write() {
        assert!(validate_default_name(r"C:\secret.savage", DestinationKind::Project).is_err());
        assert!(validate_default_name("../escape.savage", DestinationKind::Project).is_err());
        assert!(validate_default_name("untitled.savage", DestinationKind::Project).is_ok());
        assert!(validate_default_name("untitled.svg", DestinationKind::Project).is_err());

        let directory = std::env::temp_dir().join(format!(
            "savage-destination-bound-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create destination directory");
        let manager = DestinationGrantManager::default();
        for index in 0..MAX_GRANTS {
            manager
                .issue(
                    &directory.join(format!("file-{index}.savage")),
                    DestinationKind::Project,
                )
                .expect("issue within bound");
        }
        let overflow = manager
            .issue(&directory.join("overflow.savage"), DestinationKind::Project)
            .unwrap_err();
        assert!(overflow.contains("Too many destinations"));
        assert!(manager.resolve_project("not-a-grant").is_err());
        fs::remove_dir_all(directory).expect("remove destination directory");
    }
}
