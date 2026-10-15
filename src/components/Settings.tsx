import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { errorText, type DaemonClient, type DaemonConfig } from '../daemon'
import { SHORTCUT_GROUPS } from '../keymap'
import { hostLabel, useDaemon, useHost, useHostId, useStore } from '../store'
import { HostSection } from './HostSection'
import { General, GENERAL_GROUPS } from './GeneralSection'
import { Providers } from './ProvidersSection'
import { Shortcuts } from './KeymapSection'

const SECTIONS = ['Host', 'General', 'Providers', 'Keymap'] as const
export type Section = (typeof SECTIONS)[number]
export const anchor = (...parts: string[]) => `settings-${parts.join('-')}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
const toggled = <T,>(set: Set<T>, v: T, on = !set.has(v)) => {
  const next = new Set(set)
  if (on) next.add(v)
  else next.delete(v)
  return next
}
export type Patch = Parameters<DaemonClient['patchDaemonConfig']>[0]

/** Settings of the context host's daemon, plus this browser's own (keymap, notifications, default agent). */
export function Settings({ initialSection = 'General', onClose }: { initialSection?: Section; onClose: () => void }) {
  const daemon = useDaemon()
  const hostId = useHostId()
  const { hosts } = useStore()
  const { providers } = useHost()
  const [section, setSection] = useState<Section>(initialSection)
  const [expanded, setExpanded] = useState<Set<Section>>(new Set([initialSection]))
  const [query, setQuery] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<DaemonConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    daemon.getDaemonConfig().then((r) => setConfig(r.config), (e) => setError(errorText(e)))
  }, [daemon])
  useEscape(onClose)

  const patch = async (p: Patch) => {
    try {
      setConfig((await daemon.patchDaemonConfig(p)).config)
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }

  // Sidebar sub-items: [label, anchor id].
  const children: Record<Section, [string, string][]> = {
    Host: [],
    General: GENERAL_GROUPS.map((g) => [g, anchor('general', g)]),
    'Providers': providers.map((p) => [p.label ?? p.provider, anchor('provider', p.provider)]),
    'Keymap': SHORTCUT_GROUPS.map(([g]) => [g, anchor('keymap', g)]),
  }
  const go = (s: Section, target?: string) => {
    setSection(s)
    setQuery('')
    setExpanded((e) => toggled(e, s, true))
    // Scroll after React commits the section/expansion change.
    requestAnimationFrame(() => (target ? document.getElementById(target)?.scrollIntoView({ block: 'start' }) : body.current?.scrollTo({ top: 0 })))
  }

  const q = query.trim().toLowerCase()
  const shown = q ? SECTIONS : [section]
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings" role="dialog" aria-label="Settings">
        <nav className="settings-nav">
          <label className="search">
            <Search size={14} />
            <input autoFocus name="search" placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {hosts.length > 1 && <div className="settings-host muted truncate">{hostLabel(hostId)}</div>}
          {SECTIONS.map((s) => {
            const open = expanded.has(s)
            return (
              <div key={s}>
                <div className={`nav-item ${!q && s === section ? 'active' : ''}`}>
                  <button className="nav-chevron" aria-label={`${open ? 'Collapse' : 'Expand'} ${s}`} aria-expanded={open} onClick={() => setExpanded((e) => toggled(e, s))}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button className="nav-label" onClick={() => go(s)}>
                    {s}
                  </button>
                </div>
                {open && children[s].length > 0 && (
                  <div className="nav-children">
                    {children[s].map(([label, id]) => (
                      <button key={id} className="nav-child" onClick={() => go(s, id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="settings-body" ref={body}>
          {error && <div className="banner err">{error}</div>}
          {shown.map((s) =>
            // Shortcuts live in localStorage, so they don't wait for the daemon config.
            s === 'Keymap' ? (
              <Shortcuts key={s} q={q} />
            ) : s === 'Host' ? (
              <HostSection key={s} q={q} />
            ) : !config ? (
              (s === 'General' || !q) && (
                <div key={s} className="empty">
                  Loading…
                </div>
              )
            ) : s === 'General' ? (
              <General key={s} config={config} patch={patch} q={q} />
            ) : (
              <Providers key={s} config={config} patch={patch} q={q} />
            ),
          )}
        </div>
        {/* Outside the scrolling body so it stays in view; after it so it paints on top. */}
        <button className="icon-btn close" title="Close (Esc)" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export type SectionProps = { config: DaemonConfig; patch: (p: Patch) => Promise<void>; q: string }
export const matches = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q))

export function Row({ id, title, description, children }: { id?: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="setting-row" id={id}>
      <div className="grow">
        <div className="setting-title">{title}</div>
        {description && <div className="setting-desc">{description}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}
