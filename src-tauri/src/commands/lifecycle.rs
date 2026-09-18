#[tauri::command]
pub fn exit_application() {
    // Window.destroy() after a CloseRequested handler is unreliable on Windows.
    // Kill the process after the in-app Save/Discard/Cancel prompt has resolved.
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use tauri_plugin_dialog::MessageDialogResult;

    #[test]
    fn dialog_plugin_json_matches_the_frontend_parser() {
        assert_eq!(
            serde_json::to_string(&MessageDialogResult::Yes).unwrap(),
            "\"Yes\""
        );
        assert_eq!(
            serde_json::to_string(&MessageDialogResult::No).unwrap(),
            "\"No\""
        );
        assert_eq!(
            serde_json::to_string(&MessageDialogResult::Ok).unwrap(),
            "\"Ok\""
        );
        assert_eq!(
            serde_json::to_string(&MessageDialogResult::Cancel).unwrap(),
            "\"Cancel\""
        );
        assert_eq!(
            serde_json::to_string(&MessageDialogResult::Custom("Discard".into())).unwrap(),
            "\"Discard\""
        );
    }
}
