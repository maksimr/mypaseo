/** Daemon WebSocket URL from what a user types: `host`, `host:port`, `http(s)://…` or `ws(s)://…`. Throws if invalid. */
export function toWsUrl(input: string) {
  const raw = input.trim()
  const schemed = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
  const u = new URL(schemed ? raw.replace(/^http/i, 'ws') : `ws://${raw}`)
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') throw new Error('Use a ws://, wss://, http:// or https:// address')
  if (!schemed && !u.port) u.port = '6767' // the daemon's default port
  if (u.pathname === '/') u.pathname = '/ws'
  return u.href
}
