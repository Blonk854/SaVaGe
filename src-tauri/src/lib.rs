mod commands;
mod vectorize;

use commands::boolean::boolean_op;
use commands::convert::convert_image_to_svg;
use commands::export::{export_png, write_text_file};
use commands::import::read_text_file;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            convert_image_to_svg,
            read_text_file,
            write_text_file,
            export_png,
            boolean_op
        ])
        .run(tauri::generate_context!())
        .expect("error while running SaVaGe");
}
