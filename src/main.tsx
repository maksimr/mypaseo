import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchTheme } from './theme'
import { watchViewport } from './viewport'

watchTheme()
watchViewport()

// sw.js exists only in the build (vite.config.ts `offline`).
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
