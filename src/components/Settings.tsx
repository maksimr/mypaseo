import { ChevronDown, ChevronRight, Plus, RefreshCw, Search, Stethoscope, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { DAEMON_URL, daemon, errorText, type DaemonConfig, type ProviderEntry } from '../daemon'
import { useStore } from '../store'

const SECTIONS = ['General', 'LLM Providers'] as const
type Section = (typeof SECTIONS)[number]
const GENERAL_GROUPS = ['Connection', 'Agents'] as const
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
    'LLM Providers': providers.map((p) => [p.label ?? p.provider, anchor('provider', p.provider), p.provider]),
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
          {!config ? (
            <div className="empty">Loading…</div>
          ) : (
            shown.map((s) =>
              s === 'General' ? (
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
            )
          )}
        </div>
      </div>
    </div>
  )
}

type SectionProps = { config: DaemonConfig; patch: (p: Patch) => Promise<void>; q: string }
const matches = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q))

function Row({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="setting-row">
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

function Providers({ config, patch, q, open, onToggle }: SectionProps & { open: Set<string>; onToggle: (id: string) => void }) {
  const { providers } = useStore()
  const list = providers.filter((p) => matches(q, p.label, p.provider, p.description, 'provider llm model'))
  if (!list.length) return null
  return (
    <section className="settings-section">
      <h2>
        LLM Providers
        <button className="btn" onClick={() => void daemon.refreshProvidersSnapshot().catch((e) => alert(errorText(e)))}>
          <RefreshCw size={13} /> Refresh all
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
              <Plus size={13} /> Add variable
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
