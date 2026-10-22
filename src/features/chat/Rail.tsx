import { ArrowDown, Circle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import type { TimelineItem } from '../../daemon'
import { formatCombo, useShortcut } from '../../keymap'
import { readingLine } from './reading'

/** The chat's outline as a row of circles under the composer, oldest on the left: its start, the user's messages, and
 *  its end (a spinner while running). A click on a message calls `onPick` with its item's index; on the start or end,
 *  `onStart` or `onEnd`. The message whose turn is across the chat's reading line, or the end at its bottom, is
 *  highlighted. `away` from the bottom, an arrow beside the end jumps there too. */
export function Rail({
  items,
  running,
  scroller,
  onPick,
  onStart,
  onEnd,
  away,
}: {
  items: TimelineItem[]
  running: boolean
  scroller: RefObject<HTMLElement | null>
  onPick: (i: number) => void
  onStart: () => void
  onEnd: () => void
  away: boolean
}) {
  const jumpKey = useShortcut('jumpToLatest')
  const [current, setCurrent] = useState<number | 'start' | 'end'>()
  // A pick shows its step even where the chat can't scroll it to the top, until the chat scrolls on from there.
  const pinned = useRef<number>(undefined)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => {
      if (el.scrollTop === pinned.current) return
      pinned.current = undefined
      setCurrent(currentItem(el))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [scroller])
  const go = (to: number | 'start' | 'end') => {
    if (to === 'start') onStart()
    else if (to === 'end') onEnd()
    else onPick(to)
    pinned.current = scroller.current?.scrollTop
    setCurrent(to)
  }
  const messages = items.flatMap((item, i) => (item.type === 'user_message' ? [{ i, title: firstLine(item.text) }] : []))
  // The current item's message: the last at or before it.
  const at = typeof current === 'number' ? (messages.findLast((m) => m.i <= current)?.i ?? 'start') : current
  const step = (to: number | 'start' | 'end', title: string, icon: ReactNode = <Circle size={10} />) => (
    <span key={to} className={`rail-step${at === to ? ' current' : ''}`}>
      <button className="rail-pick" title={title} onClick={() => go(to)}>
        {icon}
      </button>
    </span>
  )
  const nodes =
    items.length || running
      ? [
          step('start', 'Jump to Start'),
          ...messages.map((m) => step(m.i, m.title)),
          step('end', 'Jump to Latest Message', running ? <Loader2 size={10} className="spin" /> : <Circle size={10} />),
        ]
      : []
  return (
    <div className="rail" onPointerMove={magnify} onPointerLeave={unmagnify}>
      {nodes.length > 0 && <div className="rail-sheet">{nodes}</div>}
      {nodes.length > 0 && away && (
        <button className="rail-latest" title={`Jump to Latest Message (${formatCombo(jumpKey)})`} onClick={() => go('end')}>
          <ArrowDown size={12} />
        </button>
      )}
    </div>
  )
}

const firstLine = (text: string) => text.replace(/\*\*|`/g, '').trim().split('\n')[0]

/** The item across the chat's reading line, or its end once it's scrolled to the bottom (as `atBottom` in Chat.tsx). */
function currentItem(scroller: HTMLElement): number | 'end' | undefined {
  if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40) return 'end'
  const items = scroller.querySelectorAll<HTMLElement>('.timeline > [data-item]')
  const line = readingLine(scroller)
  // The last item starting above the line: they're in order, so a binary search.
  let lo = 0
  let hi = items.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (items[mid].getBoundingClientRect().top <= line) lo = mid
    else hi = mid - 1
  }
  return items.length ? Number(items[lo].dataset.item) : undefined
}

// Magnifies the icons near the mouse, as macOS's Dock does: 2x at the pointer, easing off in a bell over 80px either
// side. `--s` grows them up from the line and apart, the lines between giving the room (chat.css).
function magnify(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse') return
  for (const b of e.currentTarget.querySelectorAll<HTMLElement>('.rail-step > button')) {
    const r = b.getBoundingClientRect()
    const d = Math.min(1, Math.abs(e.clientX - (r.left + r.width / 2)) / 80)
    b.style.setProperty('--s', String(1 + (1 + Math.cos(Math.PI * d)) / 2))
  }
}

function unmagnify(e: PointerEvent<HTMLElement>) {
  for (const b of e.currentTarget.querySelectorAll<HTMLElement>('.rail-step > button')) b.style.removeProperty('--s')
}
