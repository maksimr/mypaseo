import { useState } from 'react'
import { notificationsOn, notificationsSupported } from '../../notifications'
import { useHost } from '../../store'
import { Row, Toggle } from './Row'
import { anchor, GENERAL_GROUPS, matches, type SectionProps } from './section'

export function General({ config, patch, q }: SectionProps) {
  const [prompt, setPrompt] = useState(config.appendSystemPrompt)
  const [notify, setNotify] = useState(notificationsOn)
  const toggleNotify = async (on: boolean) => {
    if (on && (await Notification.requestPermission()) !== 'granted') return alert('Notifications are blocked for this site in your browser settings.')
    localStorage.mypaseoNotifications = on ? 'on' : 'off'
    setNotify(on)
  }
  const groups: [(typeof GENERAL_GROUPS)[number], React.ReactNode[]][] = [
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
  const { providers } = useHost()
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
