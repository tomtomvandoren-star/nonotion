import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

/**
 * Bac à sable de l'éditeur, sans serveur : c'est le « build minimal » emballé dans Capacitor
 * (Android) et Tauri (Linux) à la fin de la phase 2 pour tester tôt le clavier et la sélection
 * dans les vues web natives (spec 9).
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    // Chemins relatifs : les vues web natives chargent les fichiers depuis leur propre origine.
    base: './',
    build: {
      outDir: 'dist-sandbox',
      rollupOptions: { input: 'sandbox.html' },
    },
  }),
)
