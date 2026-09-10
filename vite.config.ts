import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const enableCrossOriginIsolation = process.env.VITE_CROSS_ORIGIN_ISOLATION === 'true';

/* Where `vite dev` and `vite preview` forward `/api` and the organisation
   assets. Matches the rewrite in vercel.json so a local run and the deployed
   preview talk to the same backend.

   Without this the dev server has nothing behind `/api`, so the organisation
   lookup 404s on startup and the app sits on its full-page spinner forever —
   the API base is relative by design, precisely so both environments can put a
   proxy in front of it. Set VITE_API_PROXY_TARGET to point somewhere else. */
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET || 'https://api.mycountrymobile.com';

const apiProxy = {
  '/api': { target: API_PROXY_TARGET, changeOrigin: true, secure: true },
  '/Organisations': { target: API_PROXY_TARGET, changeOrigin: true, secure: true },
};

export default defineConfig({
  // .env files live outside the repo (real secrets — Stripe, PayPal,
  // HubSpot, WhatsApp token, Turnstile — shouldn't sit in a project
  // directory that could end up in version control or get shared).
  /* This deployment's env lives outside the repo, under the ucaas.in name --
     the same path `/root/deploy-web.sh` documents and where `.env.ucaas` and
     `.env.production` actually sit. The old `/etc/mycountrymobile-web` does
     not exist on this box, so pointing there silently loaded no variables at
     all: the bundle came out with no VITE_API_BASE_URL and the deploy script's
     own guard rejected it for not referencing https://api.ucaas.in. */
  envDir: '/etc/ucaas-india',
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
    proxy: apiProxy,
  },
  // `vite preview` serves the built app, so it needs the same proxy to be a
  // faithful rehearsal of the deployment.
  preview: { proxy: apiProxy },
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
