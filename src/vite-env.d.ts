/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Version de l'application, injectée au build (CI). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
