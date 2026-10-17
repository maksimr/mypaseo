import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const daemon = process.env.PASEO_DAEMON ?? 'http://127.0.0.1:6767'

// Service worker served cache-first, so the app opens without a network; a new deploy shows after one reload.
const SW = `const CACHE = '__CACHE__'
const FILES = __FILES__
self.addEventListener('install', (e) => {
  self.skipWaiting()
  // cache: 'reload' skips the HTTP cache, which may still hold the previous deploy's index.html.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
})
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const req = e.request.mode === 'navigate' ? 'index.html' : e.request
  // ignoreVary: a 'Vary: Origin' response would miss for the crossorigin script and stylesheet tags.
  e.respondWith(caches.match(req, { ignoreVary: true }).then((r) => r ?? fetch(e.request)))
})
`

// Writes sw.js precaching every built file; the cache name is their content hash, so each deploy replaces the cache.
const offline: Plugin = {
  name: 'offline',
  apply: 'build',
  writeBundle({ dir }) {
    const out = dir!
    const files = readdirSync(out, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => relative(out, join(f.parentPath, f.name)))
    const hash = createHash('sha256')
    for (const f of files) hash.update(f).update(readFileSync(join(out, f)))
    const sw = SW.replace('__CACHE__', hash.digest('hex').slice(0, 12)).replace('__FILES__', JSON.stringify(files))
    writeFileSync(join(out, 'sw.js'), sw)
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offline],
  base: './', // relative asset URLs, so the build works under any path (GitHub Pages serves it at /<repo>/)
  server: {
    // No changeOrigin: daemon accepts the upgrade as same-origin (Host == Origin), so no CORS config needed.
    proxy: { '/ws': { target: daemon, ws: true } },
  },
})
