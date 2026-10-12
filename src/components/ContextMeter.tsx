import { supportsUsageReports } from '@getpaseo/client/internal/daemon-client'
import { Gauge, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { errorText, type Agent, type UsageReport } from '../daemon'
import { useDaemon } from '../store'
import { balanceAmount, formatCost, formatTokens, resetLabel, updatedLabel, upsertReport, usedPct, windowTone, windowTrailing, type Tone } from '../usage'

/** Composer ring for how full the agent's context window is; hovering or clicking it opens the details and the account's usage. */
export function ContextMeter({ agent }: { agent: Agent }) {
  const [open, setOpen] = useState(false)
  const { contextWindowMaxTokens: max, contextWindowUsedTokens: used, totalCostUsd: cost } = agent.lastUsage ?? {}
  const pct = max && max > 0 && used != null && used >= 0 ? Math.round((used / max) * 100) : null
  const label = pct != null ? `Context window ${pct}% used` : 'Context window: No context data'
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <span
      className="ctx-meter"
      // Mouse only: a tap's emulated hover would open the card right before the click toggles it shut.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.stopPropagation()
        setOpen(false)
      }}
    >
      <button className="icon-btn ctx-ring" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="2" />
          {pct != null && (
            <circle
              cx="8"
              cy="8"
              r={r}
              fill="none"
              stroke={pct > 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--text-muted)'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c - (Math.min(100, pct) / 100) * c}
              transform="rotate(-90 8 8)"
            />
          )}
        </svg>
        {pct != null && (
          <span className="ctx-text" aria-hidden>
            {((used! / max!) * 100).toFixed(1)}%/{max! >= 1_000_000 ? `${(max! / 1_000_000).toFixed(1)}M` : `${Math.round(max! / 1_000)}K`}
          </span>
        )}
      </button>
      {open && (
        <div className="ctx-card" role="dialog" aria-label="Context window">
          <div className="ctx-summary">
            <div>Context window</div>
            {pct != null ? (
              <>
                <div>{pct}% used</div>
                <div className="muted">
                  {formatTokens(used!)} / {formatTokens(max!)} tokens
                </div>
              </>
            ) : (
              <div className="muted">No context data</div>
            )}
            {cost != null && cost > 0 && <div className="muted">Session cost {formatCost(cost)}</div>}
          </div>
          <AgentUsage agentId={agent.id} />
        </div>
      )}
    </span>
  )
}

/** The usage of the account the agent runs under, one card per report as it streams in. Nothing on hosts that can't report it. */
function AgentUsage({ agentId }: { agentId: string }) {
  const daemon = useDaemon()
  const supported = supportsUsageReports(daemon.getLastServerInfoMessage()?.features)
  const [reports, setReports] = useState<UsageReport[]>()
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  // Fetched on every open: an agent resumed under another login keeps its id. The daemon caches reports for five minutes.
  useEffect(() => {
    if (!supported) return
    let live = true
    daemon
      .listUsageReports({ agentId }, (r) => live && setReports((cur) => upsertReport(cur, r)))
      .then((res) => live && setReports(res.reports))
      .catch((e) => live && setError(errorText(e)))
    return () => void (live = false)
  }, [daemon, agentId, supported])
  const refresh = () => {
    setRefreshing(true)
    setRefreshFailed(false)
    daemon
      .listUsageReports({ agentId, forceRefresh: true })
      .then((res) => setReports(res.reports))
      .catch(() => setRefreshFailed(true))
      .finally(() => setRefreshing(false))
  }

  if (!supported || reports?.length === 0) return null
  return (
    <>
      <hr />
      {error ? (
        <div className="muted">Unable to load usage: {error}</div>
      ) : !reports ? (
        <div className="muted">Loading usage…</div>
      ) : (
        reports.map((r) => <UsageCard key={r.id} entry={r} refreshing={refreshing} onRefresh={refresh} />)
      )}
      {refreshFailed && <div className="err">Unable to refresh usage</div>}
    </>
  )
}

function UsageCard({ entry, refreshing, onRefresh }: { entry: UsageReport; refreshing: boolean; onRefresh: () => void }) {
  const r = entry.report
  const problem = (p: Extract<typeof r, { status: 'unavailable' }>['problem']) => {
    if (p.kind === 'no_quota') return p.detail
    const remedy = p.refreshedBy ? `Run ${p.refreshedBy} to refresh it.` : 'Sign in again.'
    return p.kind === 'rejected' ? `Login rejected (HTTP ${p.status}). ${remedy}` : `Login expired. ${remedy}`
  }
  const message = (x: typeof r) => (x.status === 'error' ? x.error : x.status === 'unavailable' ? problem(x.problem) : '')
  const messages = r.status === 'available' ? [] : entry.loginErrors ? entry.loginErrors.map((l) => `${l.harness}: ${message(l.report)}`) : [message(r)]
  return (
    <div className="usage-card">
      <div className="usage-head">
        {entry.icon ? (
          <span className="usage-icon" style={{ maskImage: `url("data:image/svg+xml,${encodeURIComponent(entry.icon)}")` }} />
        ) : (
          <Gauge size={14} className="muted" />
        )}
        <span className="truncate">{entry.sourceLabel}</span>
        {r.status === 'available' && r.planLabel && <span className="badge">{r.planLabel}</span>}
        <span className="grow" />
        {r.status !== 'available' && (
          <span className="usage-status">
            <span className={`dot ${r.status === 'error' ? 'failed' : ''}`} />
            {r.status === 'error' ? 'Error' : 'Unavailable'}
          </span>
        )}
        <RefreshButton entry={entry} refreshing={refreshing} onRefresh={onRefresh} />
      </div>
      {messages.length > 0 && <div className="err pre-wrap">{messages.join('\n')}</div>}
      {r.status === 'available' && (
        <>
          {r.windows.map((w) => {
            const pct = usedPct(w)
            const t = windowTrailing(w)
            return (
              <UsageRow key={w.id} label={w.label} value={pct != null ? `${Math.round(pct)}%` : '—'} trailing={t?.text} atRisk={t?.atRisk} pct={pct ?? 0} tone={windowTone(w)} />
            )
          })}
          {r.balances?.map((b) => {
            const { text, pct } = balanceAmount(b)
            return <UsageRow key={b.id} label={b.label} value={text} trailing={resetLabel(b.resetsAt)} pct={pct} tone={b.tone ?? 'default'} />
          })}
          {r.details?.map((d) => (
            <div key={d.id} className="usage-label">
              <span className="muted truncate">{d.label}</span>
              <span className="truncate">{d.value}</span>
            </div>
          ))}
        </>
      )}
      {entry.account.label && <div className="muted truncate">{entry.account.label}</div>}
    </div>
  )
}

/** Its tooltip says when the report on screen was fetched, as of when the pointer or focus arrived. */
function RefreshButton({ entry, refreshing, onRefresh }: { entry: UsageReport; refreshing: boolean; onRefresh: () => void }) {
  const [now, setNow] = useState(Date.now)
  const tipId = useId()
  const tick = () => setNow(Date.now())
  return (
    <button
      className="icon-btn usage-refresh"
      aria-label={`Refresh ${entry.sourceLabel}`}
      aria-describedby={tipId}
      disabled={refreshing}
      onClick={onRefresh}
      onMouseEnter={tick}
      onFocus={tick}
    >
      {refreshing ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />}
      <span id={tipId} role="tooltip" className="usage-tip">
        {updatedLabel(entry.fetchedAt, now)}
      </span>
    </button>
  )
}

function UsageRow(p: { label: string; value: string; trailing?: string | null; atRisk?: boolean; pct: number | null; tone: Tone }) {
  return (
    <div className="usage-row">
      <div className="usage-label">
        <span className="muted truncate">{p.label}</span>
        <span className="usage-value">
          {p.value}
          {p.trailing && <span className={p.atRisk ? 'err' : 'muted'}> · {p.trailing}</span>}
        </span>
      </div>
      {p.pct != null && (
        <div className="usage-track">
          <div className={`usage-fill ${p.tone}`} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }} />
        </div>
      )}
    </div>
  )
}
