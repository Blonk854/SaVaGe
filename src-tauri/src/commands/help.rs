use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let rels = ["resources/USER_MANUAL.pdf", "USER_MANUAL.pdf"];
    for rel in rels {
        if let Ok(p) = app.path().resolve(rel, BaseDirectory::Resource) {
            paths.push(p);
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        paths.push(dir.join("resources/USER_MANUAL.pdf"));
        paths.push(dir.join("USER_MANUAL.pdf"));
    }
    if let Some(dir) = option_env!("CARGO_MANIFEST_DIR") {
        paths.push(PathBuf::from(dir).join("resources/USER_MANUAL.pdf"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("USER_MANUAL.pdf"));
        paths.push(cwd.join("src-tauri/resources/USER_MANUAL.pdf"));
        paths.push(cwd.join("resources/USER_MANUAL.pdf"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            paths.push(parent.join("USER_MANUAL.pdf"));
            paths.push(parent.join("resources/USER_MANUAL.pdf"));
        }
    }
    paths
}

#[tauri::command]
pub fn open_user_manual(app: AppHandle) -> Result<(), String> {
    let found = candidate_paths(&app)
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "Could not find USER_MANUAL.pdf".to_string())?;
    let path = found.to_str().ok_or("Could not read the manual path")?;

    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", path])
            .spawn()
            .map_err(|e| format!("Could not open the user manual: {e}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("Could not open the user manual: {e}"))?;
        Ok(())
    }
}
