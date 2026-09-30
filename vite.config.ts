import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    // Only VITE_ keys go into the client bundle. The server GEMINI_API_KEY
    // must NEVER be inlined — it would become visible to everyone in JS (secret leak).
    // The client AI runs on VITE_GEMINI_API_KEY; the server key is read
    // only in Node (server.ts/api) via process.env directly.
    'process.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY || ''),
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/data/**', '**/data/db.json', '**/*.json'],
    },
  },
  build: {
    // Explicit es2020 target (Safari 14+): without it the Vite 6 default
    // (baseline-widely-available = Safari 16+) renders an empty #root on older
    // iPhones due to untranspiled syntax in dependencies.
    target: ['es2020'],
    // 500KB default assumes a landing page. Here index (~1MB app shell + diary +
    // always-mounted modals) and firebase (~0.5MB SDK) are upfront by design and
    // load in parallel with separate long-term caching; everything deferrable
    // (tabs, charts, scanner, barcode) already lazy-loads. Warn only past that.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (/recharts|d3-|decimal\.js|eventemitter3/.test(id)) return 'charts';
          if (id.includes('@zxing') || id.includes('html5-qrcode')) return 'scan';
          if (id.includes('/@google/')) return 'ai';
          // NOTE: react/react-dom/motion/lucide deliberately stay in the default
          // vendor chunk: splitting them into react-vendor/icons caused a
          // circular chunk (vendor <-> react-vendor) because motion re-exports react.
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
});
