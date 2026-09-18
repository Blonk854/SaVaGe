mod commands;
mod vectorize;

use commands::boolean::boolean_op;
use commands::convert::{cancel_convert_job, convert_image_to_svg, ConvertJobManager};
use commands::destination_grants::{
    pick_png_destination, pick_project_destination, pick_svg_destination, DestinationGrantManager,
};
use commands::diagnostics::{export_diagnostics, record_diagnostic, DiagnosticLog};
use commands::export::{export_png, write_project_file, write_svg_export};
use commands::help::open_user_manual;
use commands::import::{read_image_preview, read_project_file, read_text_file};
use commands::lifecycle::exit_application;
use commands::recovery::{delete_recovery, list_recoveries, write_recovery};
use commands::source_grants::{
    claim_dropped_image, pick_image_source, pick_open_source, SourceGrantManager,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConvertJobManager::default())
        .manage(SourceGrantManager::default())
        .manage(DestinationGrantManager::default())
        .manage(DiagnosticLog::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.state::<DiagnosticLog>().attach(app.handle());
            Ok(())
        })
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                webview.state::<SourceGrantManager>().observe_drop(paths);
            }
        })
        .invoke_handler(tauri::generate_handler![
            convert_image_to_svg,
            cancel_convert_job,
            read_text_file,
            read_project_file,
            read_image_preview,
            write_project_file,
            write_svg_export,
            export_png,
            boolean_op,
            open_user_manual,
            write_recovery,
            list_recoveries,
            delete_recovery,
            pick_image_source,
            pick_open_source,
            claim_dropped_image,
            pick_project_destination,
            pick_svg_destination,
            pick_png_destination,
            record_diagnostic,
            export_diagnostics,
            exit_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running SaVaGe");
}
