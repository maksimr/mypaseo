// shortcut: the public SDK (createPaseoClient) has no file explorer / checkout diff RPCs, so we use the
// SDK's internal DaemonClient. Re-check these call sites when upgrading @getpaseo/client.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client'

// Same-origin /ws is proxied by Vite to the daemon (see vite.config.ts).
export const PROXY_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

/** A saved daemon connection. label defaults to the daemon's hostname. */
export type Host = { id: string; url: string; label?: string; password?: string }

// The daemon's default listen address. Builds served without the dev proxy (GitHub Pages) connect to it directly;
// browsers allow ws://127.0.0.1 from https pages, the daemon must allow the page's origin (see README).
export const LOCAL_URL = 'ws://127.0.0.1:6767/ws'

/** Used until the user edits the host list. */
export const DEFAULT_HOST: Host = {
  id: 'local',
  url: import.meta.env.VITE_PASEO_URL ?? (import.meta.env.DEV ? PROXY_URL : LOCAL_URL),
  password: import.meta.env.VITE_PASEO_PASSWORD,
}

// crypto.randomUUID only exists in secure contexts (https/localhost), so LAN http access needs this.
// DaemonClient calls it per request (not at import), so defining it here, before any use, is enough.
crypto.randomUUID ??= () =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  ) as ReturnType<Crypto['randomUUID']>

// A stable client id lets the daemon resume this browser's session after reloads.
const clientId = (localStorage.mypaseoClientId ??= crypto.randomUUID())

/** A probe (reconnect off) fails fast instead of retrying forever. */
export const createClient = (host: Host, reconnect = true) =>
  new DaemonClient({
    url: host.url,
    clientId,
    clientType: 'browser',
    password: host.password || undefined,
    reconnect: { enabled: reconnect },
    connectTimeoutMs: reconnect ? undefined : 8000,
    suppressSendErrors: true,
  })

export type { DaemonClient }
type DC = DaemonClient
/** Store entities carry the id of the host they came from; daemon ids are random, so unique across hosts. */
type OnHost<T> = T & { hostId: string }
export type RawAgent = Awaited<ReturnType<DC['fetchAgents']>>['entries'][number]['agent']
export type Project = OnHost<Awaited<ReturnType<DC['listProjects']>>['projects'][number]>
export type Workspace = OnHost<Awaited<ReturnType<DC['fetchWorkspaces']>>['entries'][number]>
export type Agent = OnHost<RawAgent>
export type Permission = Agent['pendingPermissions'][number]
export type ProviderEntry = Awaited<ReturnType<DC['getProvidersSnapshot']>>['entries'][number]
export type TimelinePage = Awaited<ReturnType<DC['fetchAgentTimeline']>>
export type TimelineItem = TimelinePage['entries'][number]['item']
export type ToolCall = Extract<TimelineItem, { type: 'tool_call' }>
export type ToolDetail = ToolCall['detail']
export type DiffFile = Awaited<ReturnType<DC['getCheckoutDiff']>>['files'][number]
export type DirEntry = Awaited<ReturnType<DC['listDirectory']>>['entries'][number]
export type SessionEntry = Awaited<ReturnType<DC['fetchRecentProviderSessions']>>['entries'][number]
export type DaemonConfig = Awaited<ReturnType<DC['getDaemonConfig']>>['config']
export type SlashCommand = Awaited<ReturnType<DC['listCommands']>>['commands'][number]
export type DraftConfig = Parameters<DC['listProviderFeatures']>[0]
/** As terminals_changed lists them, without cwd. */
export type TerminalInfo = Omit<NonNullable<Awaited<ReturnType<DC['createTerminal']>>['terminal']>, 'cwd'>
export type UsageReport = Awaited<ReturnType<DC['listUsageReports']>>['reports'][number]

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
