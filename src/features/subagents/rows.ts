import type { Agent, DaemonClient } from '../../daemon'

/** A subagent the agent's provider runs in its own session (Claude Code's Task tool, Codex's, pi's), as the daemon lists it. */
export type ProviderSubagent = Awaited<ReturnType<DaemonClient['listProviderSubagents']>>['subagents'][number]

/** `input`: waiting on a permission. */
export type Status = 'running' | 'input' | 'done' | 'failed' | 'canceled'

/** A row of the track: a Paseo agent the agent started (`paseo`), or one of its provider's subagents. `end`: when it
 *  stopped; none while it goes on. `subtitle`: the effective model, or the provider's own formatted model details. */
export type Row = { kind: 'paseo' | 'provider'; id: string; provider: string; subtitle?: string; label: string; status: Status; start: string; end?: string }

function agentStatus(a: Agent): Status {
  if (a.pendingPermissions.length) return 'input'
  if (a.status === 'running' || a.status === 'initializing') return 'running'
  return a.status === 'error' ? 'failed' : 'done'
}

export function paseoRow(a: Agent): Row {
  const status = agentStatus(a)
  const live = status === 'running' || status === 'input'
  return { kind: 'paseo', id: a.id, provider: a.provider, subtitle: a.runtimeInfo?.model ?? a.model ?? undefined, label: a.title?.trim() || 'New agent', status, start: a.createdAt, end: live ? undefined : a.updatedAt }
}

const PROVIDER_STATUS: Record<ProviderSubagent['status'], Status> = { running: 'running', completed: 'done', failed: 'failed', canceled: 'canceled' }

/** Named by its task; its title is its type ("Explore"), the same across a fan-out. */
export function providerRow(s: ProviderSubagent): Row {
  const status = PROVIDER_STATUS[s.status]
  const label = s.description?.trim() || s.title?.trim() || 'Subagent'
  return { kind: 'provider', id: s.id, provider: s.provider, subtitle: s.subtitle ?? undefined, label, status, start: s.createdAt, end: status === 'running' ? undefined : s.updatedAt }
}

/** The track's head, "Delegated 3 tasks · 2 running", and the state its mark shows: a wait on a permission before the
 *  rest, as the sidebar's marks. */
export function summary(rows: Row[]): { text: string; status: Status } {
  const count = (s: Status) => rows.filter((r) => r.status === s).length
  const [input, running, failed] = [count('input'), count('running'), count('failed')]
  const parts = [`Delegated ${rows.length} task${rows.length === 1 ? '' : 's'}`]
  if (input) parts.push(`${input} need${input === 1 ? 's' : ''} input`)
  if (running) parts.push(`${running} running`)
  if (failed) parts.push(`${failed} failed`)
  const ended: Status = count('canceled') === rows.length ? 'canceled' : 'done'
  if (parts.length === 1) parts.push(ended)
  return { text: parts.join(' · '), status: input ? 'input' : running ? 'running' : failed ? 'failed' : ended }
}

/** How long a row ran, up to `now` while it goes on. */
export const took = (r: Row, now: number) => (r.end ? Date.parse(r.end) : now) - Date.parse(r.start)

/** How long the rows ran together: from the first start to `now`, or to the last end once none goes on. */
export function span(rows: Row[], now: number) {
  const end = rows.every((r) => r.end) ? Math.max(...rows.map((r) => Date.parse(r.end!))) : now
  return end - Math.min(...rows.map((r) => Date.parse(r.start)))
}

/** "42s", "1m 24s", "2h 5m". */
export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
