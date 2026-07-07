import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'GHOST â€” Night Ninjas',
        short_name: 'GHOST',
        description: 'Training tracker. No server. Just you and the run.',
        theme_color: '#1e100b',
        background_color: '#1e100b',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            // Cache wa-sqlite WASM binary
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'wasm-cache', expiration: { maxEntries: 5 } },
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  // wa-sqlite ships WASM â€” tell Vite to serve it with correct MIME type
  assetsInclude: ['**/*.wasm'],

  // Exclude wa-sqlite from optimisation; it uses dynamic imports internally
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },

  worker: {
    format: 'es',
  },

  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          charts: ['recharts'],
        },
      },
    },
  },
});
