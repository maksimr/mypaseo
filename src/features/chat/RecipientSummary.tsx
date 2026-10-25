import { X } from 'lucide-react'
import { useId } from 'react'
import { placeMenu } from '../../components/menu'
import type { Recipient } from './Recipients'

/** Who the message goes to, by the lock: "N recipients · M joining", which opens the list. `total`: the chat's members
 *  and the joining, who'd all get a message with no mention. */
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
              <span className="dot" style={{ background: r.color }} />
              <span className="grow truncate">{r.name}</span>
              {r.joins ? <span className="recipient-joining">Joining</span> : <span className="muted">In chat</span>}
            </li>
          ))}
        </ul>
      </div>
    </span>
  )
}
