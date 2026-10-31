import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Versión visible en Ajustes > Cuenta: commit que publicó Vercel y fecha de compilación.
const version = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)} · ${new Date().toISOString().slice(0, 10)}`

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'logo-simbolo.svg', 'apple-touch-icon.png'],
      workbox: {
        // Las fuentes del alfabeto latino (incluye tildes y ñ) quedan guardadas para usar la app sin internet.
        globPatterns: ['**/*.{js,css,html,svg,png}', 'assets/*-latin-wght-normal-*.woff2'],
      },
      manifest: {
        name: 'Mis Finanzas',
        short_name: 'Finanzas',
        description: 'Registro de ingresos, gastos y compromisos financieros',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        background_color: '#1b1036',
        theme_color: '#1b1036',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
