import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const daemon = process.env.PASEO_DAEMON ?? 'http://127.0.0.1:6767'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // No changeOrigin: daemon accepts the upgrade as same-origin (Host == Origin), so no CORS config needed.
    proxy: { '/ws': { target: daemon, ws: true } },
  },
})
