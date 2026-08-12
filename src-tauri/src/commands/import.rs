use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", path, e))
}
