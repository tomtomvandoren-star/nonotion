/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Page des installateurs de l'application pour ordinateur. */
  readonly VITE_DESKTOP_DOWNLOADS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
