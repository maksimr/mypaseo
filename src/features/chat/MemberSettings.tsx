import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorText, type Agent, type ProviderEntry } from '../../daemon'
import { archiveAgent, useDaemon } from '../../store'
import { MemberAvatar, MemberName, type Member } from '../rooms/MemberList'
import { SettingList } from './RecipientChip'
import { agentSettings, sendSetting, type Session } from './session'
import { contextPct, formatCost, formatTokens, pctTone } from './usage'

/** A member's settings in the Context card, in place of its member list: the ones its composer chip opens
 *  (RecipientChip), sent to its session on Apply; Remove, but not on the `lead` (closing the lead closes the room).
 *  `onDone`: back to the list. */
export function MemberSettings({ member: m, lead, entry, onDone }: { member: Member; lead: boolean; entry: ProviderEntry | undefined; onDone: () => void }) {
  const daemon = useDaemon()
  const [picked, setPicked] = useState<Partial<Record<Session, string>>>({})
  // Another model drops the picked Thinking: it may not offer it.
  const settings = agentSettings(entry, m.agent, (field, v) => setPicked({ ...picked, [field]: v, ...(field === 'model' ? { thinking: undefined } : {}) }), picked)
  const apply = async () => {
    try {
      // The model first: the thinking level is the new model's.
      for (const field of ['model', 'thinking', 'mode'] as const) {
        const v = picked[field]
        if (v !== undefined) await sendSetting(daemon, m.agent, field, v)
      }
      onDone()
    } catch (e) {
      alert(errorText(e))
    }
  }
  return (
    <>
      <div className="member-settings">
        <div className="member-summary">
          <MemberAvatar color={m.color} />
          <span className="member-identity">
            <MemberName member={m} />
            <span className="member-brief">Settings for this agent's session.</span>
          </span>
        </div>
        <SettingList settings={settings} />
      </div>
      <SessionUsage usage={m.agent.lastUsage} />
      <div className="member-foot">
        {!lead && (
          <button
            className="btn danger member-remove"
            aria-label={`Remove @${m.handle}`}
            onClick={() => confirm(`Remove @${m.handle} from the room? Its agent is archived.`) && void archiveAgent(m.agent)}
          >
            <Trash2 size={13} /> Remove
          </button>
        )}
        <button className="member-apply" disabled={!Object.values(picked).some((v) => v !== undefined)} onClick={() => void apply()}>
          Apply
        </button>
      </div>
    </>
  )
}

/** The session's last reported usage: how full its context window is, then its tokens and cost. Whether those cover
 *  the last turn or the whole session is up to the provider, so the labels don't say. */
function SessionUsage({ usage: u }: { usage: Agent['lastUsage'] }) {
  const pct = contextPct(u)
  const max = u?.contextWindowMaxTokens ?? 0
  const used = u?.contextWindowUsedTokens ?? 0
  const rows = [
    ['Input', u?.inputTokens != null ? `${formatTokens(u.inputTokens)} tokens` : null],
    ['Output', u?.outputTokens != null ? `${formatTokens(u.outputTokens)} tokens` : null],
    ['Session cost', u?.totalCostUsd ? formatCost(u.totalCostUsd) : null],
  ].filter((r): r is [string, string] => r[1] != null)
  return (
    <section className="member-usage" aria-label="Usage">
      <div className="member-usage-head">Usage</div>
      {pct != null ? (
        <div className="usage-row">
          <div className="usage-label member-usage-context">
            <span>Context window</span>
            <span className="usage-value">{pct}%</span>
          </div>
          <div className="usage-track">
            <div className={`usage-fill ${pctTone(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="usage-label muted">
            <span>
              {formatTokens(used)} / {formatTokens(max)} tokens
            </span>
            <span>{formatTokens(Math.max(0, max - used))} remaining</span>
          </div>
        </div>
      ) : (
        <div className="muted">{u ? 'No context data' : 'No usage reported yet'}</div>
      )}
      {rows.map(([label, value]) => (
        <div key={label} className="usage-label">
          <span className="muted">{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </section>
  )
}
