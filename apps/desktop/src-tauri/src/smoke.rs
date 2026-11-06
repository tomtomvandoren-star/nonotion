//! Essai de démarrage pour la CI (phase 8). `NONOTION_SMOKE_TEST=1` ouvre l'application installée,
//! attend l'écran de connexion, note si le trousseau du système et l'API répondent, puis quitte :
//! code 0 si l'écran est apparu, 1 sinon, 2 si la page ne s'est jamais chargée. Sans cette
//! variable, rien de tout cela n'est actif.

use std::time::Duration;

/// Au-delà, l'essai échoue : la page ne s'est jamais chargée.
const TIMEOUT: Duration = Duration::from_secs(120);

/// L'adresse de l'API compilée dans le front (`apps/web/.env.desktop`, ou celle de la CI).
const API_URL: Option<&str> = option_env!("VITE_API_URL");

pub fn requested() -> bool {
    std::env::var_os("NONOTION_SMOKE_TEST").is_some()
}

pub fn start(_app: &tauri::AppHandle) {
    std::thread::spawn(|| {
        std::thread::sleep(TIMEOUT);
        eprintln!(
            "ÉCHEC : la page ne s'est pas chargée en {} s",
            TIMEOUT.as_secs()
        );
        std::process::exit(2);
    });
}

pub fn check_page(webview: &tauri::Webview) {
    let api = API_URL.map_or_else(|| "null".to_string(), |url| format!("{url:?}"));
    if let Err(error) = webview.eval(SCRIPT.replace("__API_URL__", &api)) {
        eprintln!("ÉCHEC : script d'essai refusé ({error})");
        std::process::exit(1);
    }
}

/// Le résultat de l'essai, envoyé par la page : on l'affiche, avec l'état des mises à jour, et
/// l'application se ferme.
#[tauri::command]
pub async fn smoke_report(app: tauri::AppHandle, ok: bool, detail: String) {
    println!("{detail}");
    println!("{}", updates(&app).await);
    app.exit(if ok { 0 } else { 1 });
}

/// Le manifeste des mises à jour est-il lisible ? Une version plus récente y est-elle publiée ?
async fn updates(app: &tauri::AppHandle) -> String {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        use tauri_plugin_updater::UpdaterExt;
        if !crate::updater_configured(app.config()) {
            return "Mises à jour : non configurées (pas de clé de signature à la compilation)".into();
        }
        let version = &app.package_info().version;
        match app.updater() {
            Err(error) => format!("Mises à jour : module indisponible ({error})"),
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => {
                    format!("Mises à jour : {} installée, {} disponible", version, update.version)
                }
                Ok(None) => format!("Mises à jour : manifeste lu, {version} est la dernière version"),
                Err(error) => format!("Mises à jour : manifeste illisible ({error})"),
            },
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        "Mises à jour : sans objet".into()
    }
}

const SCRIPT: &str = r#"
(async () => {
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const within = (promise, ms) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms))]);
  const deadline = Date.now() + 60000;
  while (!document.querySelector('input[type="password"]')) {
    if (Date.now() > deadline) {
      const text = (document.body && document.body.innerText) || '';
      return invoke('smoke_report', {
        ok: false,
        detail: 'ÉCHEC : écran de connexion absent (' + location.href + ')\n' + text.slice(0, 500),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const lines = ['OK : écran de connexion affiché (' + location.href + ')'];
  try {
    await within(invoke('secret_set', { key: 'nonotion.essai', value: 'ok' }), 10000);
    const back = await within(invoke('secret_get', { key: 'nonotion.essai' }), 10000);
    await within(invoke('secret_remove', { key: 'nonotion.essai' }), 10000);
    lines.push('Trousseau du système : ' + (back === 'ok' ? 'disponible' : 'réponse inattendue'));
  } catch (error) {
    lines.push('Trousseau du système : indisponible (' + error + ') ; repli sur le stockage de la vue web');
  }
  const api = __API_URL__;
  if (api) {
    try {
      const response = await within(fetch(api.replace(/\/+$/, '') + '/health'), 15000);
      lines.push('API ' + api + ' : HTTP ' + response.status);
    } catch (error) {
      lines.push('API ' + api + ' : injoignable depuis l’application (' + error + ')');
    }
  }
  invoke('smoke_report', { ok: true, detail: lines.join('\n') });
})();
"#;
