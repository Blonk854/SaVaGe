use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use super::destination_grants::{DestinationGrantManager, GrantedDestination};
use super::export::write_text_file_atomic;

const RECENT_VERSION: u32 = 1;
const RECENT_FILE_NAME: &str = "recent-projects.json";
const MAX_RECENT: usize = 10;
const MAX_RECENT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentStore {
    version: u32,
    reopen_last_project: bool,
    projects: Vec<StoredProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProject {
    id: String,
    path: String,
    display_name: String,
    parent_label: String,
    opened_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectView {
    pub id: String,
    pub display_name: String,
    pub parent_label: String,
    pub opened_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectsView {
    pub reopen_last_project: bool,
    pub projects: Vec<RecentProjectView>,
}

fn default_store() -> RecentStore {
    RecentStore {
        version: RECENT_VERSION,
        reopen_last_project: false,
        projects: Vec::new(),
    }
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| format!("System clock error: {error}"))
}

fn ensure_savage(path: &Path) -> Result<(), String> {
    let savage = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("savage"));
    if savage {
        Ok(())
    } else {
        Err("Recent projects only include .savage files".into())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Recent project was not found".into());
    }
    Ok(())
}

fn display_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("Untitled")
        .to_string()
}

fn parent_label(path: &Path) -> String {
    path.parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_string()
}

fn stored_project(id: String, path: &Path, opened_at_ms: u64) -> StoredProject {
    StoredProject {
        id,
        path: path.to_string_lossy().into_owned(),
        display_name: display_name(path),
        parent_label: parent_label(path),
        opened_at_ms,
    }
}

fn sanitize(mut store: RecentStore) -> RecentStore {
    store.version = RECENT_VERSION;
    store.projects.retain(|project| {
        validate_id(&project.id).is_ok()
            && ensure_savage(Path::new(&project.path)).is_ok()
            && !project.path.trim().is_empty()
    });
    let mut seen = Vec::new();
    store.projects.retain(|project| {
        if seen.iter().any(|id: &String| id == &project.id) {
            return false;
        }
        seen.push(project.id.clone());
        true
    });
    store.projects.truncate(MAX_RECENT);
    store
}

fn load_store(file: &Path) -> Result<RecentStore, String> {
    if !file.exists() {
        return Ok(default_store());
    }
    let bytes =
        fs::read(file).map_err(|error| format!("Could not read recent projects: {error}"))?;
    if bytes.len() > MAX_RECENT_BYTES {
        return Err("Recent projects file is too large and was left unchanged".into());
    }
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Recent projects file is invalid and was left unchanged".to_string())?;
    let version = value
        .get("version")
        .and_then(|version| version.as_u64())
        .unwrap_or(0);
    if version > u64::from(RECENT_VERSION) {
        return Err("Recent projects were saved by a newer SaVaGe and were left unchanged".into());
    }
    if version != u64::from(RECENT_VERSION) {
        return Err("Recent projects file is invalid and was left unchanged".into());
    }
    let store = serde_json::from_value(value)
        .map_err(|_| "Recent projects file is invalid and was left unchanged".to_string())?;
    Ok(sanitize(store))
}

fn save_store(file: &Path, store: &RecentStore) -> Result<(), String> {
    let encoded = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("Could not encode recent projects: {error}"))?;
    write_text_file_atomic(file, &encoded, MAX_RECENT_BYTES, None).map(|_| ())
}

pub(crate) fn remember_project(file: &Path, project_path: &Path) -> Result<(), String> {
    ensure_savage(project_path)?;
    let mut store = load_store(file)?;
    let path = project_path.to_string_lossy().into_owned();
    let opened_at_ms = now_ms()?;
    let id = store
        .projects
        .iter()
        .find(|project| project.path == path)
        .map(|project| project.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    store.projects.retain(|project| project.path != path);
    store
        .projects
        .insert(0, stored_project(id, project_path, opened_at_ms));
    store.projects.truncate(MAX_RECENT);
    save_store(file, &store)
}

pub(crate) fn list_projects(file: &Path) -> Result<RecentProjectsView, String> {
    let store = load_store(file)?;
    Ok(RecentProjectsView {
        reopen_last_project: store.reopen_last_project,
        projects: store
            .projects
            .iter()
            .map(|project| RecentProjectView {
                id: project.id.clone(),
                display_name: project.display_name.clone(),
                parent_label: project.parent_label.clone(),
                opened_at_ms: project.opened_at_ms,
            })
            .collect(),
    })
}

pub(crate) fn set_reopen_last_project_file(file: &Path, enabled: bool) -> Result<bool, String> {
    let mut store = load_store(file)?;
    store.reopen_last_project = enabled;
    save_store(file, &store)?;
    Ok(enabled)
}

pub(crate) fn project_path_for_id(file: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    let mut store = load_store(file)?;
    let Some(index) = store.projects.iter().position(|project| project.id == id) else {
        return Err("Recent project was not found".into());
    };
    let path = PathBuf::from(&store.projects[index].path);
    if path.is_file() {
        return Ok(path);
    }
    store.projects.remove(index);
    save_store(file, &store)?;
    Err("That recent project is no longer available".into())
}

pub(crate) fn startup_path(file: &Path) -> Result<Option<PathBuf>, String> {
    let store = load_store(file)?;
    if !store.reopen_last_project {
        return Ok(None);
    }
    let Some(id) = store.projects.first().map(|project| project.id.clone()) else {
        return Ok(None);
    };
    project_path_for_id(file, &id).map(Some)
}

fn recent_file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(RECENT_FILE_NAME))
        .map_err(|error| format!("Could not resolve recent projects: {error}"))
}

#[tauri::command]
pub async fn list_recent_projects(app: AppHandle) -> Result<RecentProjectsView, String> {
    let file = recent_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || list_projects(&file))
        .await
        .map_err(|error| format!("Recent projects worker failed: {error}"))?
}

#[tauri::command]
pub async fn remember_open_project(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
    destination_grant_id: String,
) -> Result<(), String> {
    let path = grants.resolve_project(&destination_grant_id)?;
    let file = recent_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || remember_project(&file, &path))
        .await
        .map_err(|error| format!("Recent projects worker failed: {error}"))?
}

#[tauri::command]
pub async fn set_reopen_last_project(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let file = recent_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || set_reopen_last_project_file(&file, enabled))
        .await
        .map_err(|error| format!("Recent projects worker failed: {error}"))?
}

#[tauri::command]
pub async fn reopen_recent_project(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
    id: String,
) -> Result<GrantedDestination, String> {
    let file = recent_file(&app)?;
    let path = tauri::async_runtime::spawn_blocking(move || project_path_for_id(&file, &id))
        .await
        .map_err(|error| format!("Recent projects worker failed: {error}"))??;
    grants.issue_project(&path)
}

#[tauri::command]
pub async fn startup_recent_project(
    app: AppHandle,
    grants: State<'_, DestinationGrantManager>,
) -> Result<Option<GrantedDestination>, String> {
    let file = recent_file(&app)?;
    let path = tauri::async_runtime::spawn_blocking(move || startup_path(&file))
        .await
        .map_err(|error| format!("Recent projects worker failed: {error}"))??;
    path.map(|path| grants.issue_project(&path)).transpose()
}

#[cfg(test)]
mod tests {
    use super::{
        list_projects, project_path_for_id, remember_project, set_reopen_last_project_file,
        startup_path, MAX_RECENT,
    };
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "savage-recent-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("temp dir");
        directory
    }

    #[test]
    fn recent_projects_keep_ten_savage_files_without_exposing_paths() {
        let directory = temp_dir("list");
        let file = directory.join("recent-projects.json");
        for index in 0..=MAX_RECENT {
            let project = directory.join(format!("project-{index}.savage"));
            fs::write(&project, b"{}").expect("project");
            remember_project(&file, &project).expect("remember");
        }
        fs::write(directory.join("notes.txt"), b"no").expect("notes");
        assert!(remember_project(&file, &directory.join("notes.txt")).is_err());

        let view = list_projects(&file).expect("list");
        assert!(!view.reopen_last_project);
        assert_eq!(view.projects.len(), MAX_RECENT);
        assert_eq!(
            view.projects[0].display_name,
            format!("project-{MAX_RECENT}")
        );
        assert!(view
            .projects
            .iter()
            .all(|project| project.display_name != "project-0"));
        let json = serde_json::to_value(&view).expect("view json");
        assert!(json["projects"][0].get("path").is_none());

        let again = directory.join(format!("project-{MAX_RECENT}.savage"));
        let id = view.projects[0].id.clone();
        remember_project(&file, &again).expect("touch");
        let refreshed = list_projects(&file).expect("refresh");
        assert_eq!(refreshed.projects[0].id, id);
        assert_eq!(refreshed.projects.len(), MAX_RECENT);
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn reopen_uses_only_a_stored_id_and_drops_missing_files() {
        let directory = temp_dir("reopen");
        let file = directory.join("recent-projects.json");
        let project = directory.join("poster.savage");
        fs::write(&project, b"{}").expect("project");
        remember_project(&file, &project).expect("remember");
        let id = list_projects(&file).expect("list").projects[0].id.clone();

        assert_eq!(project_path_for_id(&file, &id).expect("path"), project);
        assert!(project_path_for_id(&file, "C:\\not-an-id\\secret.savage").is_err());
        assert_eq!(
            list_projects(&file).expect("still listed").projects.len(),
            1
        );

        fs::remove_file(&project).expect("delete project");
        assert!(project_path_for_id(&file, &id)
            .expect_err("missing")
            .contains("no longer available"));
        assert!(list_projects(&file).expect("dropped").projects.is_empty());
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn reopen_last_project_stays_off_until_enabled() {
        let directory = temp_dir("startup");
        let file = directory.join("recent-projects.json");
        let project = directory.join("poster.savage");
        fs::write(&project, b"{}").expect("project");
        remember_project(&file, &project).expect("remember");
        assert_eq!(startup_path(&file).expect("default off"), None);

        assert!(set_reopen_last_project_file(&file, true).expect("enable"));
        assert_eq!(startup_path(&file).expect("enabled"), Some(project));
        assert!(!set_reopen_last_project_file(&file, false).expect("disable"));
        assert_eq!(startup_path(&file).expect("disabled"), None);
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn a_newer_recent_file_is_left_unchanged() {
        let directory = temp_dir("future");
        let file = directory.join("recent-projects.json");
        let original = br#"{"version":2,"reopenLastProject":true,"projects":[]}"#;
        fs::write(&file, original).expect("future file");
        assert!(list_projects(&file).expect_err("newer").contains("newer"));
        assert!(set_reopen_last_project_file(&file, false).is_err());
        assert_eq!(fs::read(&file).expect("unchanged"), original);
        fs::remove_dir_all(directory).expect("cleanup");
    }
}
