import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Zaindari',
        short_name: 'Zaindari',
        description: 'Plant care scheduler',
        // Moss and paper: the browser paints the address bar and the splash screen
        // with these, so a stale pair shows the old palette before the app loads.
        theme_color: '#4a6741',
        background_color: '#faf8f3',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        // Android will not offer "Install app" at all without both a 192px and
        // a 512px icon, and it gives no diagnostic when they are missing. The
        // maskable entry is separate on purpose: Android crops every icon to
        // the launcher's shape, so a non-maskable one gets shrunk onto a white
        // tile instead of filling it.
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // `woff2` matters as much as the rest: the app self-hosts its two
        // typefaces, and without it the installed PWA falls back to Georgia
        // and system-ui the first time it is opened offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
