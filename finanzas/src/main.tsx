import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import './styles.css'

registerSW({
  immediate: true,
  // Además de revisar al abrir, busca una versión nueva cada hora por si la app queda abierta mucho tiempo.
  onRegisteredSW(_url, registro) {
    if (registro) setInterval(() => registro.update(), 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
