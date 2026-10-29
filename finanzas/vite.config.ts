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
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mis Finanzas',
        short_name: 'Finanzas',
        description: 'Registro de ingresos, gastos y compromisos financieros',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        background_color: '#f9f9f7',
        theme_color: '#1c5cab',
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
