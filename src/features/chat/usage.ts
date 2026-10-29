import type { Agent, DaemonClient, UsageReport } from '../../daemon'

type Window = Extract<UsageReport['report'], { status: 'available' }>['windows'][number]
type Balance = NonNullable<Extract<UsageReport['report'], { status: 'available' }>['balances']>[number]
export type Tone = NonNullable<Window['tone']>

/** "28k", "1m". */
export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}m`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/** How full the agent's context window is, in whole percent; null without both numbers. */
export function contextPct(u: Agent['lastUsage']) {
  const { contextWindowMaxTokens: max, contextWindowUsedTokens: used } = u ?? {}
  return max && max > 0 && used != null && used >= 0 ? Math.round((used / max) * 100) : null
}

export const contextLabel = (pct: number | null) => (pct != null ? `Context window ${pct}% used` : 'Context window: No context data')

export const formatCost = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`)

/** "3d" / "5h" / "17m" until iso, "now" once passed, null if unparsable. */
function until(iso: string, now: number) {
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return null
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d` : h > 0 ? `${h}h` : `${m}m`
}

/** "Updated just now" / "Updated 3m ago" / "Updated 2h ago" / "Updated 4d ago". */
export function updatedLabel(iso: string, now = Date.now()) {
  const m = Math.floor((now - Date.parse(iso)) / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  return `Updated ${!(m >= 1) ? 'just now' : d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : `${m}m ago`}`
}

export function resetLabel(iso: string | null | undefined, now = Date.now()) {
  const rel = iso ? until(iso, now) : null
  return rel && (rel === 'now' ? 'resetting now' : `resets ${rel}`)
}

export function usedPct(w: Window) {
  return w.usedPct ?? (w.remainingPct != null ? 100 - w.remainingPct : null)
}

/** Warning from 70% used, danger past 90%. */
export const pctTone = (used: number | null): Tone => (used == null ? 'default' : used > 90 ? 'danger' : used >= 70 ? 'warning' : 'default')

/** The source's tone, else one from how much of the window is used. */
export function windowTone(w: Window): Tone {
  return w.tone ?? pctTone(usedPct(w))
}

/** "31% · resets 2h", or "· runs out 3h" when the source predicts the window runs out before it resets. */
export function windowTrailing(w: Window, now = Date.now()) {
  if (w.runsOutAt != null && w.shortfallPct != null) {
    const rel = until(w.runsOutAt, now)
    return { text: rel ? `runs out ${rel}` : 'runs out', atRisk: true }
  }
  const text = resetLabel(w.resetsAt, now)
  return text ? { text, atRisk: false } : null
}

/** "$1.50 / $10.00" with a share of the limit, or what is known without one. */
export function balanceAmount(b: Balance): { text: string; pct: number | null } {
  const fmt = (v: number) =>
    b.unit === 'usd'
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
      : b.unit === 'tokens'
        ? formatTokens(v)
        : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v)
  if (b.limit != null && b.limit > 0) {
    const used = b.used ?? (b.remaining != null ? b.limit - b.remaining : null)
    return { text: `${used != null ? fmt(used) : '—'} / ${fmt(b.limit)}`, pct: used != null ? (used / b.limit) * 100 : null }
  }
  if (b.remaining != null) return { text: `${fmt(b.remaining)} left`, pct: null }
  return { text: b.used != null ? fmt(b.used) : '—', pct: null }
}

type UsageAgent = Pick<Agent, 'id' | 'provider'> & { model?: string | null }

function usageProvider(agent: UsageAgent) {
  return agent.provider === 'pi' && /^openai(?:-codex)?\//.test(agent.model ?? '') ? 'codex' : agent.provider
}

/** Older hosts only report provider-wide usage; the SDK returns nothing for an agentId on those hosts. */
export function usageScope(agent: UsageAgent, usageSources: boolean) {
  return usageSources ? { agentId: agent.id } : { reportIds: [usageProvider(agent)] }
}

/** Codex through pi, or a session not loaded by the daemon, may have only host-level account reports. */
export async function loadAgentUsage(
  daemon: Pick<DaemonClient, 'listUsageReports'>,
  agent: UsageAgent,
  usageSources: boolean,
  options: { forceRefresh?: boolean; onReport?: (report: UsageReport) => void } = {},
) {
  const { forceRefresh, onReport } = options
  const scoped = await daemon.listUsageReports({ ...usageScope(agent, usageSources), forceRefresh }, onReport)
  if (!usageSources || scoped.reports.length > 0 || usageProvider(agent) !== 'codex') {
    return { reports: scoped.reports, hostWide: !usageSources }
  }
  // Discover accounts first: reportIds only selects accounts already known by the daemon.
  const global = await daemon.listUsageReports({ forceRefresh })
  return { reports: global.reports.filter((r) => r.sourceId === 'codex'), hostWide: true }
}

/** A streamed report in place of its previous copy, or appended. */
export function upsertReport(list: UsageReport[] | undefined, r: UsageReport) {
  const cur = list ?? []
  return cur.some((x) => x.id === r.id) ? cur.map((x) => (x.id === r.id ? r : x)) : [...cur, r]
}
