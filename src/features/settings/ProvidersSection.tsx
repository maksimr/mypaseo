import { ChevronDown, ChevronRight, Plus, RefreshCw, Stethoscope, X } from 'lucide-react'
import { useState } from 'react'
import { errorText, type DaemonConfig, type ProviderEntry } from '../../daemon'
import { useDaemon, useHost } from '../../store'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Toggle, anchor, matches, type SectionProps } from './Settings'

type ProviderConfig = Record<string, unknown> & { enabled?: boolean; env?: Record<string, string>; command?: string[] }

export function Providers({ config, patch, q }: SectionProps) {
  const daemon = useDaemon()
  const { providers } = useHost()
  const list = providers.filter((p) => matches(q, p.label, p.provider, p.description, 'provider llm model'))
  if (!list.length) return null
  return (
    <section className="settings-section">
      <h2>
        Providers
        <button className="icon-btn" title="Refresh All" aria-label="Refresh All Providers" onClick={() => void daemon.refreshProvidersSnapshot().catch((e) => alert(errorText(e)))}>
          <RefreshCw size={14} />
        </button>
      </h2>
      <div className="group-label">Agent providers on this daemon</div>
      {list.map((p) => (
        <ProviderRow key={p.provider} entry={p} config={config} patch={patch} />
      ))}
    </section>
  )
}

function ProviderRow({
  entry: p,
  config,
  patch,
}: {
  entry: ProviderEntry
  config: DaemonConfig
  patch: SectionProps['patch']
}) {
  const daemon = useDaemon()
  const id = p.provider
  const models = p.models?.length ?? 0
  const saved = (config.providers[id] ?? {}) as ProviderConfig
  const [command, setCommand] = useState((saved.command ?? []).join(' '))
  const [env, setEnv] = useState<[string, string][]>(Object.entries(saved.env ?? {}))
  const [diagnostic, setDiagnostic] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

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
      <div className="setting-row">
        <button className="icon-btn" aria-label={`${open ? 'Collapse' : 'Expand'} ${p.label ?? id} Settings`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <ProviderIcon provider={id} size={18} />
        <div className="grow min0">
          <div className="setting-title">
            {p.label ?? id} <span className={`pill ${p.enabled ? p.status : 'off'}`}>{p.enabled ? p.status : 'disabled'}</span>{' '}
            <span className="muted" title={p.models?.map((m) => m.label).join('\n')}>
              {models} {models === 1 ? 'model' : 'models'}
            </span>
          </div>
          <div className="setting-desc">{p.error ?? p.description}</div>
        </div>
        <div className="setting-control">
          <Toggle label={`Enable ${p.label ?? id}`} checked={p.enabled} onChange={(v) => void patch({ providers: { [id]: { enabled: v } } })} />
        </div>
      </div>
      {open && (
        <div className="provider-body">
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
