import { Plus, Server, Settings, X } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { useState, type FormEvent } from 'react'
import { useEscape } from '../../a11y'
import { createClient, errorText } from '../../daemon'
import { toWsUrl } from './hostUrl'
import { addHost, hostEndpoint, hostLabel, hostOfServer, useStore } from '../../store'

/** Popover listing every host with its connection status; picking one opens its settings. */
export function HostMenu({ id, onOpenHost, onAdd }: { id: string; onOpenHost: (hostId: string) => void; onAdd: () => void }) {
  const { hosts, byHost } = useStore()
  return (
    <div id={id} popover="auto" className="menu host-menu">
      {hosts.map((h) => (
        <button key={h.id} popoverTarget={id} popoverTargetAction="hide" onClick={() => onOpenHost(h.id)}>
          <span className={`dot ${byHost[h.id]?.status}`} title={byHost[h.id]?.error ?? byHost[h.id]?.status} />
          <span className="truncate">{hostLabel(h.id)}</span>
          <span className="host-addr muted truncate">{hostEndpoint(h)}</span>
          <Settings size={14} className="muted" aria-hidden />
        </button>
      ))}
      <button popoverTarget={id} popoverTargetAction="hide" onClick={onAdd}>
        <Plus size={14} /> Add Host
      </button>
    </div>
  )
}

/** Saves a host only after a one-off connection proves the address and password work. */
export function AddHostDialog({ onClose }: { onClose: () => void }) {
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEscape(onClose)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const url = toWsUrl(address)
      const probe = createClient({ id: '', url, password }, false)
      const info = await probe
        .connect()
        .then(() => probe.getLastServerInfoMessage())
        .finally(() => void probe.close())
      const same = info && hostOfServer(info.serverId)
      if (same) throw new Error(`This daemon is already added as ${hostLabel(same.id)}.`)
      addHost({ id: crypto.randomUUID(), url, label: info?.hostname ?? undefined, password: password || undefined })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog narrow" role="dialog" aria-label="Add Host" onSubmit={submit}>
        <header className="dialog-head">
          <Server size={15} className="muted" />
          <h2 className="grow">Add Host</h2>
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-toolbar">
          <input
            autoFocus
            className="input mono grow"
            name="address"
            aria-label="Address"
            placeholder="host:6767 or wss://…"
            autoComplete="off"
            spellCheck={false}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <input
            className="input host-password"
            type="password"
            name="password"
            aria-label="Password"
            placeholder="Password (optional)"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <p className="dialog-note muted">
          The daemon must listen on an address this browser can reach (<code>PASEO_LISTEN</code>) and allow{' '}
          <code>{location.origin}</code> in <code>PASEO_CORS_ORIGINS</code> or <code>daemon.cors.allowedOrigins</code>.
        </p>
        {error && <div className="banner err">{error}</div>}
        <footer className="dialog-actions">
          <button type="button" className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <button className="btn primary" disabled={busy || !address.trim()}>
            {busy && <Spinner size={13} />} Add Host
          </button>
        </footer>
      </form>
    </div>
  )
}
