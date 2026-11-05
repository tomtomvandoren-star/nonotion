// Pas de console en plus de la fenêtre sous Windows, en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Nonotion pour Windows, macOS et Linux (phase 8) : le site, emballé avec Tauri 2. Le côté natif
//! se limite au trousseau du système (jeton de connexion), à l'ouverture des liens externes, à la
//! taille de la fenêtre retenue et aux mises à jour signées.

mod smoke;

use tauri::Manager;

/// Le nom sous lequel le jeton est rangé dans le trousseau du système.
const KEYCHAIN_SERVICE: &str = "be.thomasvandoren.nonotion";

/// Le trousseau peut demander une confirmation (macOS) ou passer par D-Bus (Linux) : jamais sur le
/// fil de la fenêtre.
async fn keychain<T: Send + 'static>(
    key: String,
    action: impl FnOnce(keyring::Entry) -> keyring::Result<T> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        keyring::Entry::new(KEYCHAIN_SERVICE, &key).and_then(action)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn secret_get(key: String) -> Result<Option<String>, String> {
    keychain(key, |entry| match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error),
    })
    .await
}

#[tauri::command]
async fn secret_set(key: String, value: String) -> Result<(), String> {
    keychain(key, move |entry| entry.set_password(&value)).await
}

#[tauri::command]
async fn secret_remove(key: String) -> Result<(), String> {
    keychain(key, |entry| match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error),
    })
    .await
}

/// Les mises à jour ne sont actives que si la clé publique de signature est fournie à la
/// compilation (`plugins.updater.pubkey`) : sans elle, rien ne pourrait être vérifié.
fn updater_configured(config: &tauri::Config) -> bool {
    config
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .is_some_and(|key| !key.trim().is_empty())
}

fn main() {
    let smoke_test = smoke::requested();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());
    let builder = if smoke_test {
        builder.invoke_handler(tauri::generate_handler![
            secret_get,
            secret_set,
            secret_remove,
            smoke::smoke_report
        ])
    } else {
        builder.invoke_handler(tauri::generate_handler![secret_get, secret_set, secret_remove])
    };

    builder
        .setup(move |app| {
            #[cfg(desktop)]
            if updater_configured(app.config()) {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            if smoke_test {
                smoke::start(app.handle());
            }
            Ok(())
        })
        .on_page_load(move |webview, payload| {
            if smoke_test && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                smoke::check_page(webview);
            }
        })
        .run(tauri::generate_context!())
        .expect("impossible de lancer Nonotion");
}
