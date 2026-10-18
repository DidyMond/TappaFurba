/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Token pubblico Mapbox (Map GL JS) con restrizione per URL. Solo in apps/web/.env, mai committato. */
  readonly VITE_MAPBOX_PUBLIC_TOKEN?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
