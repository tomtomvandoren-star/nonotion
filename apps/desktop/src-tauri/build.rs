fn main() {
    // L'essai de démarrage lit l'adresse de l'API compilée dans le front (smoke.rs).
    println!("cargo:rerun-if-env-changed=VITE_API_URL");
    tauri_build::build()
}
