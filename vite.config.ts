import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * POS (Front Office) — Vite configuration.
 *
 *   npm run dev      → http://localhost:5173 and http://<your-LAN-IP>:5173
 *   npm run build    → dist/, deployable to any static host
 *
 * Everything has a default, so a fresh clone needs no .env file.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  /* 5173 by convention (POSSA takes 5174). Override with PORT=… if taken. */
  const port = Number(env.PORT || 5173);

  /* Served from a sub-path on GitHub Pages (/<repo>/), `/` everywhere else. */
  const base = env.VITE_BASE_PATH || '/';

  /* Only used in api and hybrid modes, by the dev and preview servers — never reaches the bundle. */
  const dataSource = (env.VITE_DATA_SOURCE || 'mock').toLowerCase();
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:5001';

  /* Same-origin /api for the dev server and for `vite preview` of a built bundle (api and hybrid modes). */
  const apiProxy: Record<string, ProxyOptions> | undefined =
    dataSource === 'api' || dataSource === 'hybrid'
      ? {
          /* Same-origin /api in development: no CORS, no mixed content. */
          /* Exactly /api and /api/…: the page /api-performance belongs to the app, not the server. */
          '^/api(/|$)': {
            target: apiTarget,
            changeOrigin: true,
            secure: false,
            configure: (proxy) => {
              proxy.on('error', (error) => {
                console.error(`\n[proxy] Cannot reach the API at ${apiTarget}: ${error.message}`);
                console.error('[proxy] Start POSAPI, or set VITE_DATA_SOURCE=mock.\n');
              });
            },
          },
        }
      : undefined;

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(dirname, './src') },
    },
    server: {
      port,
      /* Fail loudly instead of drifting to 5175: the README, the phone on the
         LAN and any bookmarked URL all assume this port. */
      strictPort: true,
      /* Listen on every interface, so a phone or Sunmi terminal on the same
         Wi-Fi can open http://<your-LAN-IP>:5173. Vite prints the address. */
      host: true,
      open: false,
      proxy: apiProxy,
    },
    preview: { port, strictPort: true, host: true, proxy: apiProxy },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          /* Long-lived vendor chunks: an app deploy does not bust the React or
             charting cache on a terminal with a slow connection. */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
