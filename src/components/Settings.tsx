import { ChevronDown, ChevronRight, Plus, RefreshCw, RotateCcw, Search, Stethoscope, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { DAEMON_URL, daemon, errorText, type DaemonConfig, type ProviderEntry } from '../daemon'
import { SHORTCUTS, SHORTCUT_IDS, binding, comboOf, formatCombo, setShortcut, useShortcut, type ShortcutId } from '../keymap'
import { notificationsOn, notificationsSupported } from '../notifications'
import { useStore } from '../store'

const SECTIONS = ['General', 'Providers', 'Keymap'] as const
type Section = (typeof SECTIONS)[number]
const GENERAL_GROUPS = ['Connection', 'Agents', 'Notifications'] as const
const anchor = (...parts: string[]) => `settings-${parts.join('-')}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
const toggled = <T,>(set: Set<T>, v: T, on = !set.has(v)) => {
  const next = new Set(set)
  if (on) next.add(v)
  else next.delete(v)
  return next
}
type Patch = Parameters<typeof daemon.patchDaemonConfig>[0]
type ProviderConfig = Record<string, unknown> & { enabled?: boolean; env?: Record<string, string>; command?: string[] }

export function Settings({ onClose }: { onClose: () => void }) {
  const { providers } = useStore()
  const [section, setSection] = useState<Section>('General')
  const [expanded, setExpanded] = useState<Set<Section>>(new Set(['General']))
  const [openProviders, setOpenProviders] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<DaemonConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    daemon.getDaemonConfig().then((r) => setConfig(r.config), (e) => setError(errorText(e)))
  }, [])
  useEscape(onClose)

  const patch = async (p: Patch) => {
    try {
      setConfig((await daemon.patchDaemonConfig(p)).config)
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }

  // Sidebar sub-items: [label, anchor id, provider to expand].
  const children: Record<Section, [string, string, string?][]> = {
    General: GENERAL_GROUPS.map((g) => [g, anchor('general', g)]),
    'Providers': providers.map((p) => [p.label ?? p.provider, anchor('provider', p.provider), p.provider]),
    'Keymap': [...SHORTCUT_IDS.map((id) => [SHORTCUTS[id].label, anchor('keymap', id)] as [string, string]), ['Close Dialog', anchor('keymap', 'close')]],
  }
  const go = (s: Section, target?: string, providerId?: string) => {
    setSection(s)
    setQuery('')
    setExpanded((e) => toggled(e, s, true))
    if (providerId) setOpenProviders((o) => toggled(o, providerId, true))
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
                    {children[s].map(([label, id, providerId]) => (
                      <button key={id} className="nav-child" onClick={() => go(s, id, providerId)}>
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
          <button className="icon-btn close" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
          {error && <div className="banner err">{error}</div>}
          {shown.map((s) =>
            // Shortcuts live in localStorage, so they don't wait for the daemon config.
            s === 'Keymap' ? (
              <Shortcuts key={s} q={q} />
            ) : !config ? (
              s === shown[0] && (
                <div key={s} className="empty">
                  Loading…
                </div>
              )
            ) : s === 'General' ? (
              <General key={s} config={config} patch={patch} q={q} />
            ) : (
              <Providers
                key={s}
                config={config}
                patch={patch}
                q={q}
                open={openProviders}
                onToggle={(id) => setOpenProviders((o) => toggled(o, id))}
              />
            ),
          )}
        </div>
      </div>
    </div>
  )
}

type SectionProps = { config: DaemonConfig; patch: (p: Patch) => Promise<void>; q: string }
const matches = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q))

function Row({ id, title, description, children }: { id?: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

function General({ config, patch, q }: SectionProps) {
  const { status } = useStore()
  const [prompt, setPrompt] = useState(config.appendSystemPrompt)
  const [notify, setNotify] = useState(notificationsOn)
  const toggleNotify = async (on: boolean) => {
    if (on && (await Notification.requestPermission()) !== 'granted') return alert('Notifications are blocked for this site in your browser settings.')
    localStorage.mypaseoNotifications = on ? 'on' : 'off'
    setNotify(on)
  }
  const groups: [(typeof GENERAL_GROUPS)[number], React.ReactNode[]][] = [
    [
      'Connection',
      [
        matches(q, 'daemon address connection') && (
          <Row key="addr" title="Daemon" description="WebSocket address this UI is connected to.">
            <code className="inline">{DAEMON_URL}</code> <span className="muted">{status}</span>
          </Row>
        ),
      ],
    ],
    [
      'Agents',
      [
        matches(q, 'default provider model thinking new agent') && (
          <Row key="default" title="Default for New Agent" description="Provider, model and thinking a new agent starts with.">
            <DefaultAgent />
          </Row>
        ),
        matches(q, 'system prompt append agents') && (
          <Row key="prompt" title="Append System Prompt" description="Extra instructions appended to every agent's system prompt.">
            <textarea
              className="input"
              name="appendSystemPrompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => prompt !== config.appendSystemPrompt && void patch({ appendSystemPrompt: prompt })}
            />
          </Row>
        ),
        matches(q, 'mcp inject tools agents') && (
          <Row key="mcp" title="Paseo Tools for Agents" description="Inject the Paseo MCP server so agents can manage other agents and workspaces.">
            <Toggle label="Paseo tools" checked={config.mcp.injectIntoAgents} onChange={(v) => void patch({ mcp: { injectIntoAgents: v } })} />
          </Row>
        ),
        matches(q, 'auto archive merge') && (
          <Row key="archive" title="Auto-archive After Merge" description="Archive a worktree workspace once its branch is merged.">
            <Toggle label="Auto-archive" checked={config.autoArchiveAfterMerge} onChange={(v) => void patch({ autoArchiveAfterMerge: v })} />
          </Row>
        ),
      ],
    ],
    [
      'Notifications',
      [
        matches(q, 'desktop browser notifications alerts finished permission') && (
          <Row
            key="notify"
            title="Desktop Notifications"
            description={notificationsSupported ? 'Notify when an agent finishes, fails or needs permission while you look elsewhere.' : 'Not supported in this browser.'}
          >
            {notificationsSupported && <Toggle label="Desktop notifications" checked={notify} onChange={(v) => void toggleNotify(v)} />}
          </Row>
        ),
      ],
    ],
  ]
  const visible = groups.map(([label, rows]) => [label, rows.filter(Boolean)] as const).filter(([, rows]) => rows.length)
  if (!visible.length) return null
  return (
    <section className="settings-section">
      <h2>General</h2>
      {visible.map(([label, rows]) => (
        <div key={label} id={anchor('general', label)} className="settings-group">
          <div className="group-label">{label}</div>
          {rows}
        </div>
      ))}
    </section>
  )
}

type DefaultAgentPick = { provider?: string; model?: string; thinking?: string }

// Stored in this browser only; Chat's Composer reads it before the last-used draft.
function DefaultAgent() {
  const { providers } = useStore()
  // Until a default is saved, show the last-used draft: that is what a new agent starts with.
  const [def, setDef] = useState<DefaultAgentPick>(() => {
    const { provider, model, thinking }: DefaultAgentPick = JSON.parse(localStorage.mypaseoDefaultAgent ?? localStorage.mypaseoDraft ?? '{}')
    return { provider, model, thinking }
  })
  const save = (d: DefaultAgentPick) => {
    setDef(d)
    localStorage.mypaseoDefaultAgent = JSON.stringify(d)
  }
  const usable = providers.filter((p) => (p.enabled && p.status === 'ready') || p.provider === def.provider)
  const provider = def.provider ?? usable[0]?.provider
  const entry = providers.find((p) => p.provider === provider)
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const model = models.find((m) => m.id === def.model) ?? models.find((m) => m.isDefault) ?? models[0]
  const thinkingOptions = model?.thinkingOptions ?? []
  return (
    <div className="setting-selects">
      <select className="input select" aria-label="Default provider" value={provider ?? ''} onChange={(e) => save({ provider: e.target.value })}>
        {usable.map((p) => (
          <option key={p.provider} value={p.provider}>
            {p.label ?? p.provider}
          </option>
        ))}
      </select>
      {models.length > 0 && (
        <select className="input select" aria-label="Default model" value={def.model ?? ''} onChange={(e) => save({ provider, model: e.target.value || undefined })}>
          <option value="">Provider default</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}
      {thinkingOptions.length > 0 && (
        <select className="input select" aria-label="Default thinking" value={def.thinking ?? ''} onChange={(e) => save({ ...def, provider, thinking: e.target.value || undefined })}>
          <option value="">Model default</option>
          {thinkingOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function Providers({ config, patch, q, open, onToggle }: SectionProps & { open: Set<string>; onToggle: (id: string) => void }) {
  const { providers } = useStore()
  const list = providers.filter((p) => matches(q, p.label, p.provider, p.description, 'provider llm model'))
  if (!list.length) return null
  return (
    <section className="settings-section">
      <h2>
        Providers
        <button className="btn" onClick={() => void daemon.refreshProvidersSnapshot().catch((e) => alert(errorText(e)))}>
          <RefreshCw size={13} /> Refresh All
        </button>
      </h2>
      <div className="group-label">Agent providers on this daemon</div>
      {list.map((p) => (
        <ProviderRow key={p.provider} entry={p} config={config} patch={patch} open={open.has(p.provider)} onToggle={() => onToggle(p.provider)} />
      ))}
    </section>
  )
}

function ProviderRow({
  entry: p,
  config,
  patch,
  open,
  onToggle,
}: {
  entry: ProviderEntry
  config: DaemonConfig
  patch: SectionProps['patch']
  open: boolean
  onToggle: () => void
}) {
  const id = p.provider
  const saved = (config.providers[id] ?? {}) as ProviderConfig
  const [command, setCommand] = useState((saved.command ?? []).join(' '))
  const [env, setEnv] = useState<[string, string][]>(Object.entries(saved.env ?? {}))
  const [diagnostic, setDiagnostic] = useState<string | null>(null)

  const nextEnv = Object.fromEntries(env.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v]))
  // shortcut: whitespace-split argv, no shell quoting; fine for a binary path plus simple flags.
  const nextCommand = command.trim() ? command.trim().split(/\s+/) : undefined
  const dirty =
    JSON.stringify(nextEnv) !== JSON.stringify(saved.env ?? {}) || JSON.stringify(nextCommand) !== JSON.stringify(saved.command)

  const save = async () => {
    const next: ProviderConfig = { ...saved, env: Object.keys(nextEnv).length ? nextEnv : undefined, command: nextCommand }
    const dropsKeys = Object.keys(saved.env ?? {}).some((k) => !(k in nextEnv)) || (!!saved.command && !nextCommand)
    if (!dropsKeys) return patch({ providers: { [id]: next } })
    // Config patches deep-merge, so deleting a key means removing the override and writing the rest back.
    // removeProviders also drops the provider from metadataGeneration, so restore that too.
    await patch({ removeProviders: [id] })
    const rest = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined))
    await patch({ ...(Object.keys(rest).length ? { providers: { [id]: rest } } : {}), metadataGeneration: config.metadataGeneration })
  }

  const diagnose = async () => {
    setDiagnostic('Running diagnostics…')
    try {
      setDiagnostic((await daemon.getProviderDiagnostic(id)).diagnostic)
    } catch (e) {
      setDiagnostic(errorText(e))
    }
  }

  return (
    <div className="provider" id={anchor('provider', id)}>
      <div className="setting-row clickable" onClick={onToggle}>
        <ChevronRight size={14} className={`muted ${open ? 'rot90' : ''}`} />
        <div className="grow min0">
          <div className="setting-title">
            {p.label ?? id} <span className={`pill ${p.enabled ? p.status : 'off'}`}>{p.enabled ? p.status : 'disabled'}</span>
          </div>
          <div className="setting-desc">{p.error ?? p.description}</div>
        </div>
        <div className="setting-control" onClick={(e) => e.stopPropagation()}>
          <Toggle label={`Enable ${p.label ?? id}`} checked={p.enabled} onChange={(v) => void patch({ providers: { [id]: { enabled: v } } })} />
        </div>
      </div>
      {open && (
        <div className="provider-body">
          <div className="field">
            <div className="field-label">Models</div>
            <div className="chips">
              {p.models?.length ? p.models.map((m) => <span key={m.id} className="chip" title={m.id}>{m.label}</span>) : <span className="muted">None reported</span>}
            </div>
          </div>
          <div className="field">
            <div className="field-label">Command</div>
            <input className="input mono" name={`${id}-command`} placeholder="Default binary on PATH" value={command} onChange={(e) => setCommand(e.target.value)} />
          </div>
          <div className="field">
            <div className="field-label">Environment (API keys, endpoints)</div>
            {env.map(([k, v], i) => (
              <div key={i} className="env-row">
                <input className="input mono" aria-label="Variable name" placeholder="NAME" value={k} onChange={(e) => setEnv(env.with(i, [e.target.value, v]))} />
                <input className="input mono" aria-label="Variable value" type="password" placeholder="value" value={v} onChange={(e) => setEnv(env.with(i, [k, e.target.value]))} />
                <button className="icon-btn" title="Remove" onClick={() => setEnv(env.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <button className="btn ghost" onClick={() => setEnv([...env, ['', '']])}>
              <Plus size={13} /> Add Variable
            </button>
          </div>
          <div className="provider-actions">
            <button className="btn primary" disabled={!dirty} onClick={() => void save()}>
              Save
            </button>
            <button className="btn" onClick={() => void daemon.refreshProvidersSnapshot({ providers: [id] }).catch((e) => alert(errorText(e)))}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="btn" onClick={() => void diagnose()}>
              <Stethoscope size={13} /> Diagnostics
            </button>
          </div>
          {diagnostic && <pre className="term">{diagnostic}</pre>}
        </div>
      )}
    </div>
  )
}

function Shortcuts({ q }: { q: string }) {
  const ids = SHORTCUT_IDS.filter((id) => matches(q, SHORTCUTS[id].label, SHORTCUTS[id].description, 'keyboard shortcuts keymap'))
  const esc = matches(q, 'close dialog escape keyboard shortcuts keymap')
  if (!ids.length && !esc) return null
  return (
    <section className="settings-section">
      <h2>Keymap</h2>
      <div className="group-label">Click a shortcut, then press the new keys. Esc cancels.</div>
      {ids.map((id) => (
        <ShortcutRow key={id} id={id} />
      ))}
      {esc && (
        <Row id={anchor('keymap', 'close')} title="Close Dialog" description="Close Settings and other dialogs. Can't be remapped.">
          <kbd>Esc</kbd>
        </Row>
      )}
    </section>
  )
}

function ShortcutRow({ id }: { id: ShortcutId }) {
  const { label, description, default: initial } = SHORTCUTS[id]
  const combo = useShortcut(id)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const record = (e: React.KeyboardEvent) => {
    if (!recording || (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey)) return // Tab still moves focus
    // Keep Esc from closing Settings and the pressed keys from triggering their current action.
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return setRecording(false)
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
    const next = comboOf(e)
    const taken = SHORTCUT_IDS.find((other) => other !== id && binding(other) === next)
    setError(taken ? `${formatCombo(next)} is already used by ${SHORTCUTS[taken].label}.` : null)
    if (taken) return
    setShortcut(id, next)
    setRecording(false)
  }

  return (
    <Row id={anchor('keymap', id)} title={label} description={error ? <span className="err">{error}</span> : description}>
      <span className="shortcut">
        <button
          className={`btn ${recording ? 'recording' : ''}`}
          aria-label={`Change ${label} Shortcut (${formatCombo(combo)})`}
          aria-pressed={recording}
          onClick={() => setRecording(!recording)}
          onKeyDown={record}
          onBlur={() => {
            setRecording(false)
            setError(null)
          }}
        >
          {recording ? 'Press keys…' : <kbd>{formatCombo(combo)}</kbd>}
        </button>
        {combo !== initial && (
          <button className="icon-btn" title="Reset" aria-label={`Reset ${label} Shortcut`} onClick={() => setShortcut(id)}>
            <RotateCcw size={13} />
          </button>
        )}
      </span>
    </Row>
  )
}
