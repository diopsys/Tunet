import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { visualizer } from 'rollup-plugin-visualizer';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const analyze = process.env.ANALYZE === 'true';

// Nur Dev-Server: Token aus .env in index.html setzen, wie es der Produktionsserver mit HA_TOKEN tut.
// Sonst muss es nach jedem Leeren des Browser-Speichers (Safari nach 7 Tagen) neu eingegeben werden.
// Eigene Variablennamen, damit das Backend nicht in den gemeinsamen HA_TOKEN-Modus wechselt.
const devTokenPlugin = () => ({
  name: 'tunet-dev-token',
  apply: 'serve',
  transformIndexHtml(html, ctx) {
    const env = loadEnv(ctx.server?.config.mode || 'development', process.cwd(), '');
    const token = env.TUNET_DEV_HA_TOKEN;
    if (!token) return html;
    const url = env.TUNET_DEV_HA_URL || env.TUNET_INTERNAL_HA_URL || '';
    const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return html.replace('<html', `<html data-ha-token="${esc(token)}" data-ha-url="${esc(url)}"`);
  },
});

export default defineConfig({
  base: './',
  plugins: [
    react(),
    devTokenPlugin(),
    analyze &&
      visualizer({
        filename: 'dist/bundle-report.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react-router')) {
            return 'vendor-router';
          }

          if (id.includes('@remix-run/router')) {
            return 'vendor-router';
          }

          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('/node_modules/prop-types/') ||
            id.includes('/node_modules/react-is/') ||
            id.includes('/node_modules/use-sync-external-store/')
          ) {
            return 'vendor-react';
          }

          if (id.includes('home-assistant-js-websocket')) {
            return 'vendor-ha-ws';
          }

          if (id.includes('leaflet')) {
            return 'vendor-leaflet';
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons-lucide';
          }

          if (id.includes('@mdi/js')) {
            return 'vendor-icons-mdi-js';
          }

          if (id.includes('@mdi/react')) {
            return 'vendor-icons-mdi-react';
          }

          if (id.includes('react-icons/fa6')) {
            return 'vendor-icons-react-fa6';
          }

          if (id.includes('react-icons/md')) {
            return 'vendor-icons-react-md';
          }

          if (id.includes('react-icons/fi')) {
            return 'vendor-icons-react-fi';
          }

          if (id.includes('react-icons/bi')) {
            return 'vendor-icons-react-bi';
          }

          if (id.includes('react-icons/cg')) {
            return 'vendor-icons-react-cg';
          }

          if (id.includes('react-icons/ri')) {
            return 'vendor-icons-react-ri';
          }

          if (id.includes('react-icons/tb')) {
            return 'vendor-icons-react-tb';
          }

          if (id.includes('react-icons/bs')) {
            return 'vendor-icons-react-bs';
          }

          if (id.includes('react-icons/gi')) {
            return 'vendor-icons-react-gi';
          }

          if (id.includes('react-icons')) {
            return 'vendor-icons-react-misc';
          }

          if (
            id.includes('/node_modules/dayjs/') ||
            id.includes('/node_modules/date-fns/') ||
            id.includes('/node_modules/lodash/') ||
            id.includes('/node_modules/lodash-es/') ||
            id.includes('/node_modules/clsx/') ||
            id.includes('/node_modules/nanoid/') ||
            id.includes('/node_modules/tslib/')
          ) {
            return 'vendor-utils';
          }

          return;
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
  },
});
