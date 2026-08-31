import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const enableCrossOriginIsolation = process.env.VITE_CROSS_ORIGIN_ISOLATION === 'true';

/** Secrets directory on the production host; absent everywhere else. */
const SECRETS_ENV_DIR = '/etc/mycountrymobile-web';

/**
 * Upstream the dev server proxies `/api` to.
 *
 * The API only sends CORS headers to hosts it allowlists, so a browser on
 * localhost cannot call it directly. Proxying keeps the request same-origin.
 * The deployed build does the same thing through `vercel.json`.
 */
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET || 'https://api2.mycountrymobile.com';

export default defineConfig({
  // .env files live outside the repo (real secrets — Stripe, PayPal,
  // HubSpot, WhatsApp token, Turnstile — shouldn't sit in a project
  // directory that could end up in version control or get shared).
  //
  // That directory only exists on the production host. Pointing at it
  // unconditionally meant every other build — Vercel, CI, a fresh clone —
  // silently found no .env file and baked `undefined` into every VITE_* value,
  // which leaves the app with no API base URL at runtime. Fall back to the
  // project root so a local .env, or variables injected by the hosting
  // platform, are picked up instead.
  envDir: fs.existsSync(SECRETS_ENV_DIR) ? SECRETS_ENV_DIR : __dirname,
  define: {
    global: 'globalThis',
    Lame: {},
    Presets: {},
    GainAnalysis: {},
    QuantizePVT: {},
    Quantize: {},
    Takehiro: {},
    Reservoir: {},
    MPEGMode: {},
    BitStream: {},
    assetsInclude: ['**/*.wasm'],
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: enableCrossOriginIsolation
      ? {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        }
      : undefined,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
      },
      // Organisation logos are served from the API host under this path, and
      // the app builds their URLs from the same base as the API.
      '/Organisations': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  // `vite preview` serves the built app, so it needs the same proxy to be a
  // faithful rehearsal of the deployment.
  preview: {
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
      },
      // Organisation logos are served from the API host under this path, and
      // the app builds their URLs from the same base as the API.
      '/Organisations': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
