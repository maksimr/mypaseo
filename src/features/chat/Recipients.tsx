import { ChevronDown } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { placeMenu } from '../../components/menu'
import type { Agent } from '../../daemon'
import { RecipientChip } from './RecipientChip'
import { briefOf } from './session'

/** An agent the message goes to: its chip, and its agent if it runs already. */
export type Recipient = Omit<Parameters<typeof RecipientChip>[0], 'id' | 'several'> & { key: string; agent?: Agent }

/** The composer's recipients on one line: a chip each with its settings at a glance, or, for several that don't fit,
 *  one "N agents" chip whose menu lists them. `panelId`: each chip's panel id is it + its key. */
export function Recipients({ recipients, panelId }: { recipients: Recipient[]; panelId: string }) {
  const row = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [fit, setFit] = useState(true)
  const several = recipients.length > 1
  const keys = recipients.map((r) => r.key).join()
  // Whether the chips fit side by side. The row is as wide as its chips, so the spare width the bar's spacer (.grow)
  // holds on the row's line is room too.
  useLayoutEffect(() => {
    const el = row.current
    if (!el || !several) return
    const spacer = el.parentElement?.querySelector<HTMLElement>(':scope > .grow')
    const measure = () => {
      const css = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      const s = spacer?.getBoundingClientRect()
      const spare = s && s.top > box.top && s.top < box.bottom ? s.width : 0
      const room = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) + spare
      const gap = parseFloat(css.columnGap) || 0
      const widths = [...el.querySelectorAll<HTMLElement>('.recipient:not(.recipient-more)')].map((c) => c.offsetWidth)
      setFit(widths.reduce((sum, w) => sum + w + gap, -gap) <= room)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (spacer) observer.observe(spacer)
    return () => observer.disconnect()
  }, [several, keys])

  const chip = ({ key, ...r }: Recipient) => <RecipientChip key={key} id={`${panelId}${key}`} several={several} {...r} />
  return (
    <div ref={row} className={`recipients ${several ? 'several' : ''}`} role="group" aria-label="Recipients">
      {!several || fit ? (
        recipients.map(chip)
      ) : (
        // The chips sit in it, unseen and measured, their panels opening here.
        <span className="recipient recipient-more">
          <button className="recipient-chip" title="Show All Recipients" popoverTarget={menuId} onClick={placeMenu(menuId, true)}>
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
