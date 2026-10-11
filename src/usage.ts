import type { UsageReport } from './daemon'

type Window = Extract<UsageReport['report'], { status: 'available' }>['windows'][number]
type Balance = NonNullable<Extract<UsageReport['report'], { status: 'available' }>['balances']>[number]
export type Tone = NonNullable<Window['tone']>

/** "28k", "1m". */
export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}m`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

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

export function resetLabel(iso: string | null | undefined, now = Date.now()) {
  const rel = iso ? until(iso, now) : null
  return rel && (rel === 'now' ? 'resetting now' : `resets ${rel}`)
}

export function usedPct(w: Window) {
  return w.usedPct ?? (w.remainingPct != null ? 100 - w.remainingPct : null)
}

/** The source's tone, else one from how much of the window is used. */
export function windowTone(w: Window): Tone {
  const used = usedPct(w)
  return w.tone ?? (used == null ? 'default' : used > 90 ? 'danger' : used >= 70 ? 'warning' : 'default')
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

/** A streamed report in place of its previous copy, or appended. */
export function upsertReport(list: UsageReport[] | undefined, r: UsageReport) {
  const cur = list ?? []
  return cur.some((x) => x.id === r.id) ? cur.map((x) => (x.id === r.id ? r : x)) : [...cur, r]
}
