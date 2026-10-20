import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useEscape } from '../../a11y'
import { isTouch } from '../../focus'
import { errorText, type DaemonConfig } from '../../daemon'
import { SHORTCUT_GROUPS } from '../../keymap'
import { hostLabel, useDaemon, useHost, useHostId, useStore } from '../../store'
import { HostSection } from './HostSection'
import { General } from './GeneralSection'
import { Providers } from './ProvidersSection'
import { Shortcuts } from './KeymapSection'
import { anchor, GENERAL_GROUPS, type Patch } from './section'

const SECTIONS = ['Host', 'General', 'Providers', 'Keymap'] as const
export type Section = (typeof SECTIONS)[number]
const toggled = <T,>(set: Set<T>, v: T, on = !set.has(v)) => {
  const next = new Set(set)
  if (on) next.add(v)
  else next.delete(v)
  return next
}

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
  // The config error belongs to the sections that read the config; Host shows its connection error under Address.
  const bannerAt = shown.find((s) => s === 'General' || s === 'Providers')
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings" role="dialog" aria-label="Settings">
        <nav className="settings-nav">
          <label className="search">
            <Search size={14} />
            <input autoFocus={!isTouch()} name="search" placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          {shown.map((s) => (
            <Fragment key={s}>
              {
                // Shortcuts live in localStorage, so they don't wait for the daemon config.
                s === 'Keymap' ? (
                  <Shortcuts q={q} />
                ) : s === 'Host' ? (
                  <HostSection q={q} />
                ) : !config ? (
                  // Blank while loading; on failure, just the title and why.
                  error &&
                  s === bannerAt && (
                    <section className="settings-section">
                      <h2>{s}</h2>
                      <div className="banner err">{error}</div>
                    </section>
                  )
                ) : s === 'General' ? (
                  <General config={config} patch={patch} q={q} error={s === bannerAt ? error : null} />
                ) : (
                  <Providers config={config} patch={patch} q={q} error={s === bannerAt ? error : null} />
                )
              }
            </Fragment>
          ))}
        </div>
        {/* Outside the scrolling body so it stays in view; after it so it paints on top. */}
        <button className="icon-btn close" title="Close (Esc)" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
