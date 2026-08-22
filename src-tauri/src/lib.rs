mod commands;
mod vectorize;

use commands::boolean::boolean_op;
use commands::convert::convert_image_to_svg;
use commands::export::{export_png, write_text_file};
use commands::help::open_user_manual;
use commands::import::{read_image_preview, read_text_file};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            convert_image_to_svg,
            read_text_file,
            read_image_preview,
            write_text_file,
            export_png,
            boolean_op,
            open_user_manual
        ])
        .run(tauri::generate_context!())
        .expect("error while running SaVaGe");
}
