// shortcut: the public SDK (createPaseoClient) has no file explorer / checkout diff RPCs, so we use the
// SDK's internal DaemonClient. Re-check these call sites when upgrading @getpaseo/client.
import { DaemonClient } from '@getpaseo/client/internal/daemon-client'

// Same-origin /ws is proxied by Vite to the daemon (see vite.config.ts).
export const DAEMON_URL =
  import.meta.env.VITE_PASEO_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

// crypto.randomUUID only exists in secure contexts (https/localhost), so LAN http access needs this.
// DaemonClient calls it per request (not at import), so defining it here, before any use, is enough.
crypto.randomUUID ??= () =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  ) as ReturnType<Crypto['randomUUID']>

// A stable client id lets the daemon resume this browser's session after reloads.
const clientId = (localStorage.mypaseoClientId ??= crypto.randomUUID())

export const daemon = new DaemonClient({
  url: DAEMON_URL,
  clientId,
  clientType: 'browser',
  password: import.meta.env.VITE_PASEO_PASSWORD,
  reconnect: { enabled: true },
  suppressSendErrors: true,
})

type DC = DaemonClient
export type Project = Awaited<ReturnType<DC['listProjects']>>['projects'][number]
export type Workspace = Awaited<ReturnType<DC['fetchWorkspaces']>>['entries'][number]
export type Agent = Awaited<ReturnType<DC['fetchAgents']>>['entries'][number]['agent']
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
export type DiffMode = 'uncommitted' | 'base'

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
