# mypaseo

Custom web UI for [Paseo](https://github.com/getpaseo/paseo). The backend is the official Paseo daemon
(`@getpaseo/cli`); the UI talks to it over WebSocket with the official SDK (`@getpaseo/client`).

Features: project → workspace → agent sidebar, agent chat (streaming timeline, permissions, model/mode/thinking
pickers), file browser, Zed-style multibuffer of uncommitted / branch changes, and settings for daemon + LLM providers.

```bash
npm install
npm run daemon   # official daemon, foreground, uses ~/.paseo (skip if Paseo desktop is already running)
npm run dev      # Vite on :5173, proxies /ws -> 127.0.0.1:6767
npm test         # node:test unit tests (src/*.test.ts)
```

File browsing and diffs use the SDK's internal `DaemonClient` (`@getpaseo/client/internal/daemon-client`), since the
public API doesn't expose them yet — see `src/daemon.ts`.

Env:
- `PASEO_DAEMON` (vite.config.ts) — daemon HTTP address for the dev proxy. Default `http://127.0.0.1:6767`.
- `VITE_PASEO_URL` — connect directly instead of via the proxy (add your origin to
  `daemon.cors.allowedOrigins` in `~/.paseo/config.json` or `PASEO_CORS_ORIGINS`).
- `VITE_PASEO_PASSWORD` — if the daemon has a password (`paseo daemon set-password`).

SDK docs: https://paseo.sh/docs/sdk
