import { useState } from 'react'
import { notificationsOn, notificationsSupported } from '../../notifications'
import { setTheme, useTheme, type Theme } from '../../theme'
import { Row, Toggle } from './Row'
import { anchor, GENERAL_GROUPS, matches, type SectionProps } from './section'

export function General({ config, patch, q, error }: SectionProps) {
  const [prompt, setPrompt] = useState(config.appendSystemPrompt)
  const [notify, setNotify] = useState(notificationsOn)
  const theme = useTheme()
  const toggleNotify = async (on: boolean) => {
    if (on && (await Notification.requestPermission()) !== 'granted') return alert('Notifications are blocked for this site in your browser settings.')
    localStorage.mypaseoNotifications = on ? 'on' : 'off'
    setNotify(on)
  }
  const groups: [(typeof GENERAL_GROUPS)[number], React.ReactNode[]][] = [
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
    [
      'Appearance',
      [
        matches(q, 'theme appearance light dark white color scheme') && (
          <Row key="theme" title="Theme" description="Light, dark, or whichever your system uses. Stored in this browser.">
            <select className="input select" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Row>
        ),
      ],
    ],
  ]
  const visible = groups.map(([label, rows]) => [label, rows.filter(Boolean)] as const).filter(([, rows]) => rows.length)
  if (!visible.length && !error) return null
  return (
    <section className="settings-section">
      <h2>General</h2>
      {error && <div className="banner err">{error}</div>}
      {visible.map(([label, rows]) => (
        <div key={label} id={anchor('general', label)} className="settings-group">
          <div className="group-label">{label}</div>
          {rows}
        </div>
      ))}
    </section>
  )
}
