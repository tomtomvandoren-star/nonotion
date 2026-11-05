/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // En dev, /api est relayé vers « php artisan serve » : même origine qu'en production.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    // Les heures locales des tests sont celles de Bruxelles (changement d'heure compris), quel que
    // soit le fuseau de la machine : la CI tourne en UTC.
    env: { TZ: 'Europe/Brussels' },
  },
})
