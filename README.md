# mypaseo

Custom web UI for [Paseo](https://github.com/getpaseo/paseo). The backend is the official Paseo daemon
(`@getpaseo/cli`); the UI talks to it over WebSocket with the official SDK (`@getpaseo/client`).

Features: project → workspace → agent sidebar, agent chat (streaming timeline, permissions, model/mode/thinking
pickers), file browser, Zed-style multibuffer of uncommitted / branch changes, and settings for daemon + providers.

```bash
npm install
npm run daemon   # official daemon, foreground, uses ~/.paseo (skip if Paseo desktop is already running)
npm run dev      # Vite on :5173, proxies /ws -> 127.0.0.1:6767
npm test         # node:test unit tests (src/*.test.ts)
```

Staging diff chunks needs the `mypaseo-git` daemon plugin in [paseo-plugin/](paseo-plugin/), since the daemon has no git
index API. One-time setup per machine; the daemon then loads it from this directory on every start (Stage stays hidden
without it):

```bash
npx paseo daemon config set pluginsEnabled true && npx paseo daemon reload
npx paseo plugin install ./paseo-plugin   # after editing it: npx paseo plugin reload mypaseo-git
```

File browsing and diffs use the SDK's internal `DaemonClient` (`@getpaseo/client/internal/daemon-client`), since the
public API doesn't expose them yet — see `src/daemon.ts`.

Hosts: the sidebar's server button lists daemons with their status; Add Host connects to more (`host:port` or
`ws(s)://…`), and their projects merge into the sidebar. The browser connects to each directly, so a remote daemon
must listen on a reachable address (`PASEO_LISTEN`) and allow this UI's origin (`PASEO_CORS_ORIGINS` or
`daemon.cors.allowedOrigins`). Hosts and their passwords are saved in this browser's localStorage.

## GitHub Pages

`.github/workflows/pages.yml` builds and deploys every push to `main` (one-time: repo Settings → Pages → Source:
GitHub Actions). The deployed UI has no proxy: its default host is the daemon at `ws://127.0.0.1:6767/ws`, so whoever
opens the page talks to the daemon on their own computer. The daemon only accepts allowed origins, so allow the page
once (a running daemon picks it up immediately; the list replaces the old one, so keep entries you need):

```bash
npx @getpaseo/cli daemon config set daemon.cors.allowedOrigins '["https://app.paseo.sh","https://maksimr.github.io"]'
```

The page shows this command when it can't reach a daemon.

### Remote daemon (Caddy or Cloudflare Tunnel)

The page is HTTPS, so the browser reaches a daemon on another machine only over `wss://` (plain `ws://` works just for
`127.0.0.1`/`localhost`). Keep the daemon on `127.0.0.1:6767` and put Caddy or a Cloudflare Tunnel in front of it. On
the daemon machine, besides allowing the origin above:

```bash
npx @getpaseo/cli daemon set-password   # the daemon is now public and agents run shell commands; restart it after
npx @getpaseo/cli daemon config set daemon.hostnames '["paseo.example.com"]'   # else the proxied Host gets 403
```

Then in the page: Add Host → `https://paseo.example.com` plus the password.

Caddy needs a DNS name pointing at the machine with ports 80/443 reachable; it gets the certificate itself and proxies
WebSockets as is:

```bash
caddy reverse-proxy --from paseo.example.com --to 127.0.0.1:6767
```

Cloudflare Tunnel needs no open ports or public IP. A quick tunnel needs no account, but its hostname changes on every
run, so allow the whole domain (`daemon.hostnames '[".trycloudflare.com"]'`):

```bash
cloudflared tunnel --url http://127.0.0.1:6767   # prints https://<random>.trycloudflare.com
```

For a fixed hostname on your own Cloudflare domain, create a tunnel in Cloudflare Zero Trust, route `paseo.example.com`
to `http://127.0.0.1:6767`, and run the `cloudflared tunnel run --token …` command it shows.

Env:
- `PASEO_DAEMON` (vite.config.ts) — daemon HTTP address for the dev proxy. Default `http://127.0.0.1:6767`.
- `VITE_PASEO_URL` — the default host connects directly instead of via the proxy (add your origin to
  `daemon.cors.allowedOrigins` in `~/.paseo/config.json` or `PASEO_CORS_ORIGINS`).
- `VITE_PASEO_PASSWORD` — the default host's password (`paseo daemon set-password`).

Both `VITE_` values only seed the default host; once the host list is edited, it lives in localStorage.

SDK docs: https://paseo.sh/docs/sdk

UI copy: action labels follow [doc/action-labels.md](doc/action-labels.md). Icon actions follow
[doc/action-grid.md](doc/action-grid.md).
