import { X } from 'lucide-react'
import { useId } from 'react'
import { placeMenu } from '../../components/menu'
import { ProfileIcon } from '../rooms/ProfileIcon'
import { ContextGauge } from './ContextMeter'
import type { Recipient } from './Recipients'
import { contextLabel, contextPct } from './usage'

/** Who the message goes to, by the lock: "N recipients · M joining", which opens the list, with how full each running
 *  agent's context window is. `total`: the chat's members and the joining, who'd all get a message with no mention. */
export function RecipientSummary({ recipients, total }: { recipients: Recipient[]; total: number }) {
  const id = useId()
  const n = recipients.length
  const joining = recipients.filter((r) => r.joins).length
  return (
    <span className="recipient-summary">
      <button className="recipient-count" popoverTarget={id} onClick={placeMenu(id, true)}>
        {n} {n === 1 ? 'recipient' : 'recipients'}
        {joining > 0 && <span className="muted">· {joining} joining</span>}
      </button>
      <div id={id} popover="auto" className="menu recipient-summary-panel" role="dialog" aria-labelledby={`${id}title`}>
        <div className="recipient-summary-head">
          <h3 id={`${id}title`}>Message recipients</h3>
          <button className="icon-btn" title="Close" popoverTarget={id} popoverTargetAction="hide">
            <X size={16} />
          </button>
        </div>
        <p className="muted">{n === total ? `All ${n}` : `${n} of ${total}`} will receive this message.</p>
        <ul>
          {recipients.map((r) => (
            <li key={r.key}>
              <ProfileIcon icon={r.icon} color={r.color} size={16} />
              <span className="truncate">{r.name}</span>
              {r.joins ? <span className="recipient-joining">Joining</span> : <span className="muted">In chat</span>}
              {r.agent && (
                <span className="recipient-usage" role="img" aria-label={contextLabel(contextPct(r.agent.lastUsage))}>
                  <ContextGauge usage={r.agent.lastUsage} />
                </span>
              )}
            </li>
          ))}
        </ul>
        {recipients.some((r) => contextPct(r.agent?.lastUsage) != null) && <p className="faint recipient-summary-note">Context used / capacity</p>}
      </div>
    </span>
  )
}
