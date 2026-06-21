/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_SHORT_NAME?: string;
  readonly VITE_APP_SLOGAN?: string;
  readonly VITE_APP_TAGLINE?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_APP_SUPPORT_EMAIL?: string;
  readonly VITE_COMPANY_NAME?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_OUTLOOK_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
