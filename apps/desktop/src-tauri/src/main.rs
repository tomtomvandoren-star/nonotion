// Pas de console en plus de la fenêtre sous Windows, en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("impossible de lancer Nonotion");
}
