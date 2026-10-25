import { ChevronDown } from 'lucide-react'
import { useId, useRef } from 'react'
import { placeMenu } from '../../components/menu'
import type { Agent } from '../../daemon'
import { RecipientChip } from './RecipientChip'
import { briefOf } from './session'

/** An agent the message goes to: its chip, and its agent if it runs already. */
export type Recipient = Omit<Parameters<typeof RecipientChip>[0], 'id' | 'several' | 'onBack'> & { key: string; agent?: Agent }

/** The composer's recipients on one line: one's chip with its settings at a glance, or, for several, one "N agents"
 *  chip whose menu lists them. `panelId`: each chip's panel id is it + its key. */
export function Recipients({ recipients, panelId }: { recipients: Recipient[]; panelId: string }) {
  const menuId = useId()
  const more = useRef<HTMLButtonElement>(null)
  const several = recipients.length > 1
  // One of several: its panel's Back opens the list again.
  const back = several ? () => more.current?.click() : undefined
  const chip = ({ key, ...r }: Recipient) => (
    <RecipientChip key={key} id={`${panelId}${key}`} several={several} onBack={back} {...r} />
  )
  return (
    <div className={`recipients ${several ? 'several' : ''}`} role="group" aria-label="Recipients">
      {!several ? (
        recipients.map(chip)
      ) : (
        // The chips sit in it, unseen, their panels opening here.
        <span className="recipient recipient-more">
          <button ref={more} className="recipient-chip" title="Show All Recipients" popoverTarget={menuId} onClick={placeMenu(menuId, true)}>
            <span className="recipient-dots">
              {recipients.map((r) => (
                <span key={r.key} className="dot" style={{ background: r.color }} />
              ))}
            </span>
            {recipients.length} agents
            <ChevronDown size={12} />
          </button>
          <div id={menuId} popover="auto" className="menu recipient-list" role="dialog" aria-label="Recipients">
            <div className="recipient-list-head" aria-hidden>
              <span>Recipients</span>
              <span>Model · Thinking</span>
            </div>
            {recipients.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  // Its chip's panel, here.
                  document.getElementById(menuId)!.hidePopover()
                  document.querySelector<HTMLButtonElement>(`[popovertarget="${CSS.escape(`${panelId}${r.key}`)}"]`)?.click()
                }}
              >
                <span className="dot" style={{ background: r.color }} />
                <span className="recipient-name truncate">{r.name}</span>
                <span className="recipient-brief truncate">{briefOf(r.settings)}</span>
                <ChevronDown size={14} />
              </button>
            ))}
            <p className="faint recipient-list-note">Model, thinking and mode are configured per agent.</p>
          </div>
          {recipients.map(chip)}
        </span>
      )}
    </div>
  )
}
