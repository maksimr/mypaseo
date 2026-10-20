import { Import, Loader2, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useEscape } from '../../a11y'
import { errorText, type Agent, type DaemonClient, type SessionEntry } from '../../daemon'
import { isTouch } from '../../focus'
import { rememberAgent, useDaemon, useHost, useHostId } from '../../store'
import type { Target } from './target'

type Listing = Awaited<ReturnType<DaemonClient['fetchRecentProviderSessions']>>

const PAGE = 50
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(s) < 3600 ? [s / 60, 'minute'] : Math.abs(s) < 86400 ? [s / 3600, 'hour'] : [s / 86400, 'day']
  return rtf.format(Math.round(n), unit)
}

/** Lists provider sessions started outside Paseo (CLI runs etc.) for a directory and imports one as an agent. */
export function ImportSession({ target, onClose, onImported }: { target: Target; onClose: () => void; onImported: (a: Agent) => void }) {
  const daemon = useDaemon()
  const hostId = useHostId()
  const { providers } = useHost()
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [listing, setListing] = useState<{ key: string; data?: Listing; error?: string } | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  useEscape(onClose)

  const cwd = target.workspace?.workspaceDirectory ?? target.rootPath
  // Unavailable providers only report "binary not found", so ask the ready ones.
  const ready = providers.filter((p) => p.enabled && p.status === 'ready')
  const providerIds = (provider ? [provider] : ready.map((p) => p.provider)).join(',')
  const q = query.trim()
  const key = `${cwd}|${providerIds}|${q}|${limit}`

  useEffect(() => {
    const providers = providerIds ? providerIds.split(',') : []
    let alive = true
    const timer = setTimeout(() => {
      daemon
        .fetchRecentProviderSessions({ cwd, limit, ...(providers.length ? { providers } : {}), ...(q ? { query: q } : {}) })
        .then(
          (data) => alive && setListing({ key, data }),
          (e) => alive && setListing({ key, error: errorText(e) }),
        )
    }, q ? 200 : 0) // debounce typing
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [daemon, key, cwd, providerIds, q, limit])

  const current = listing?.key === key ? listing : null
  const shown = current?.data ?? listing?.data // keep previous rows while the next page/query loads

  const importSession = async (e: SessionEntry) => {
    setImporting(e.providerHandleId)
    setImportError(null)
    try {
      const agent = await daemon.importAgent({
        providerId: e.providerId,
        providerHandleId: e.providerHandleId,
        // The daemon lists only sessions whose cwd is this directory (realpath-aware), so import with our
        // path: the session's own may be a symlink variant (/private/tmp) that would spawn a duplicate project.
        cwd,
        ...(target.workspace ? { workspaceId: target.workspace.id } : {}),
      })
      onImported(rememberAgent(hostId, agent))
    } catch (err) {
      setImportError(errorText(err))
      setImporting(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Import Session">
        <header className="dialog-head">
          <Import size={16} className="muted" />
          <h2 className="grow truncate">Import Session into {target.workspace ? target.workspace.title || target.workspace.name : target.name}</h2>
          <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-toolbar">
          <label className="search grow">
            <Search size={14} />
            <input autoFocus={!isTouch()} name="query" placeholder="Search sessions…" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(PAGE))} />
          </label>
          <select className="input select" name="provider" aria-label="Provider" value={provider} onChange={(e) => (setProvider(e.target.value), setLimit(PAGE))}>
            <option value="">All providers</option>
            {ready.map((p) => (
              <option key={p.provider} value={p.provider}>
                {p.label ?? p.provider}
              </option>
            ))}
          </select>
        </div>
        <p className="dialog-note muted">
          Sessions started outside Paseo in <code className="inline">{cwd}</code>. Importing resumes the session as an agent.
        </p>
        {importError && <div className="banner err">{importError}</div>}
        <div className="session-list">
          {current?.error && <div className="empty err">{current.error}</div>}
          {!shown && !current?.error && <div className="empty">Loading sessions…</div>}
          {shown?.entries.length === 0 && <div className="empty">No sessions to import</div>}
          {shown?.entries.map((e) => {
            const title = e.title?.trim() || e.firstPromptPreview?.trim() || 'Untitled session'
            const last = e.lastPromptPreview?.trim()
            return (
              <div key={`${e.providerId}:${e.providerHandleId}`} className="session">
                <div className="grow min0">
                  <div className="session-title">
                    <span className="chip">{e.providerLabel}</span>
                    <span className="truncate">{title}</span>
                  </div>
                  <div className="session-meta truncate">
                    {ago(e.lastActivityAt)}
                    {last && last !== title && ` · ${last}`}
                  </div>
                </div>
                <button className="btn" disabled={importing !== null} onClick={() => void importSession(e)}>
                  {importing === e.providerHandleId ? <Loader2 size={13} className="spin" /> : <Import size={13} />} Import
                </button>
              </div>
            )
          })}
          {shown && shown.entries.length >= limit && limit < 200 && (
            <button className="load-older" onClick={() => setLimit(Math.min(limit + PAGE, 200))}>
              {current ? 'Load More' : 'Loading…'}
            </button>
          )}
        </div>
        {(!!shown?.filteredAlreadyImportedCount || !!shown?.providerErrors?.length) && (
          <footer className="dialog-foot muted">
            {!!shown.filteredAlreadyImportedCount && <div>{shown.filteredAlreadyImportedCount} already imported sessions hidden</div>}
            {shown.providerErrors?.map((p) => (
              <div key={p.provider} className="err">
                {p.provider}: {p.message}
              </div>
            ))}
          </footer>
        )}
      </div>
    </div>
  )
}
