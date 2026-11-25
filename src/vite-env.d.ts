/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' (default) runs fully offline; 'api' talks to POSAPI. */
  readonly VITE_DATA_SOURCE?: string;
  /** Legacy switch, still honoured: 'false' means api. */
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Set to 'false' to hide the persona drawer and demo bar in mock mode. */
  readonly VITE_DEMO_TOOLS?: string;
  readonly VITE_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
