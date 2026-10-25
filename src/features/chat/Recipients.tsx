import { ChevronDown } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { placeMenu } from '../../components/menu'
import type { Agent } from '../../daemon'
import { RecipientChip } from './RecipientChip'
import { briefOf } from './session'

/** An agent the message goes to: its chip, and its agent if it runs already. */
export type Recipient = Omit<Parameters<typeof RecipientChip>[0], 'id' | 'compact'> & { key: string; agent?: Agent }

/** The composer's recipients on one line: one chip with its settings at a glance, or compact chips for several, those
 *  that don't fit behind "+N agents", whose menu lists every recipient. `panelId`: each chip's panel id is it + its key. */
export function Recipients({ recipients, panelId }: { recipients: Recipient[]; panelId: string }) {
  const row = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [fit, setFit] = useState(recipients.length)
  const compact = recipients.length > 1
  const keys = recipients.map((r) => r.key).join()
  // How many chips fit with the +N chip after them; all of them, without it, if they fit alone.
  useLayoutEffect(() => {
    const el = row.current
    if (!el || !compact) return
    const measure = () => {
      const css = getComputedStyle(el)
      const room = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
      const gap = parseFloat(css.columnGap) || 0
      const widths = [...el.querySelectorAll<HTMLElement>('.recipient:not(.recipient-more)')].map((c) => c.offsetWidth)
      let used = widths.reduce((sum, w) => sum + w + gap, -gap)
      let n = widths.length
      if (used > room) {
        used = el.querySelector<HTMLElement>('.recipient-more')!.offsetWidth
        for (n = 0; n < widths.length && used + gap + widths[n] <= room; n++) used += gap + widths[n]
      }
      setFit(n)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [compact, keys])

  const chip = ({ key, ...r }: Recipient) => <RecipientChip key={key} id={`${panelId}${key}`} compact={compact} {...r} />
  const hidden = compact ? recipients.slice(fit) : []
  return (
    <div ref={row} className={`recipients ${compact ? 'compact' : ''}`} role="group" aria-label="Recipients">
      {compact ? recipients.slice(0, fit).map(chip) : recipients.map(chip)}
      {compact && (
        // Measured even when all chips fit (`unused`); the chips that don't fit sit in it, unseen, their panels opening here.
        <span className={`recipient recipient-more ${hidden.length ? '' : 'unused'}`}>
          <button className="recipient-chip" title="Show All Recipients" popoverTarget={menuId} onClick={placeMenu(menuId, true)}>
            +{hidden.length} agents
            <ChevronDown size={12} />
          </button>
          <div id={menuId} popover="auto" className="menu recipient-list">
            {recipients.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  // Its chip's panel, at its chip (here, if it's hidden).
                  document.getElementById(menuId)!.hidePopover()
                  document.querySelector<HTMLButtonElement>(`[popovertarget="${CSS.escape(`${panelId}${r.key}`)}"]`)?.click()
                }}
              >
                <span className="dot" style={{ background: r.color }} />
                <span className="recipient-name">{r.name}</span>
                <span className="recipient-brief faint truncate">{briefOf(r.settings)}</span>
              </button>
            ))}
          </div>
          {hidden.map(chip)}
        </span>
      )}
    </div>
  )
}
