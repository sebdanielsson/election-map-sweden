/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Mapbox GL access token. Decrypted from .env.<mode> by dotenvx at run time. */
  readonly VITE_MAPBOX_ACCESS_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
