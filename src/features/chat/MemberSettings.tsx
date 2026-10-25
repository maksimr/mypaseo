import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorText, type ProviderEntry } from '../../daemon'
import { archiveAgent, useDaemon } from '../../store'
import { MemberAvatar, MemberName, type Member } from '../rooms/MemberList'
import { SettingList } from './RecipientChip'
import { agentSettings, sendSetting, type Session } from './session'

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
