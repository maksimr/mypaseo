import {
  Bot,
  Brain,
  Circle,
  CircleAlert,
  FilePen,
  FilePlus,
  FileText,
  GitBranch,
  Globe,
  Info,
  ListChecks,
  ListTodo,
  Loader2,
  MessageSquare,
  Scissors,
  Search,
  SquareTerminal,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import type { TimelineItem, ToolDetail } from '../../daemon'
import { fold } from './fold'
import { toolArg } from './toolArg'

type Step = { i: number; icon: LucideIcon; failed: boolean; minor: boolean }

/** The agent's timeline as a row of icons under the composer, oldest on the left. What doesn't fit folds into crosses
 *  of dots (see `fold`); a click on one opens a card above it listing its run on a vertical rail. A click on a step
 *  calls `onPick` with its item's index; the last, a circle (a spinner while running), `onEnd`. The step at the top of
 *  `scroller`, or the circle at its bottom, is highlighted. */
export function Rail({
  items,
  running,
  scroller,
  onPick,
  onEnd,
}: {
  items: TimelineItem[]
  running: boolean
  scroller: RefObject<HTMLElement | null>
  onPick: (i: number) => void
  onEnd: () => void
}) {
  const [current, setCurrent] = useState<number | 'end'>()
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
  const go = (to: number | 'end') => {
    if (to === 'end') onEnd()
    else onPick(to)
    pinned.current = scroller.current?.scrollTop
    setCurrent(to)
  }
  const rail = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  useLayoutEffect(() => {
    // Synchronously, so it refolds before the resize paints. Hidden with the composer, it measures 0: keeps the last.
    const ro = new ResizeObserver(([e]) => e.contentRect.width && flushSync(() => setWidth(e.contentRect.width)))
    ro.observe(rail.current!)
    return () => ro.disconnect()
  }, [])
  const cardId = useId()
  const [shown, setShown] = useState<number>() // the card's run, by its first item's index
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 }) // the center of its .rail-run, for the card's placement
  const steps = items.flatMap((item, i): Step[] => {
    const icon = stepIcon(item)
    return icon ? [{ i, icon, failed: isFailed(item), minor: item.type !== 'user_message' }] : []
  })
  const folded = fold(steps, width)
  const card = folded.find((n) => n.run && n.steps[0].i === shown)?.steps ?? []
  const nodes = folded.map(({ run: isRun, steps: run }): ReactNode => {
    const first = run[0].i
    if (!isRun) return <StepIcon key={first} step={run[0]} current={first === current} title={summary(items[first])} onClick={() => go(first)} />
    return (
      <span key={`run${first}`} className={stepClass(run.some((s) => s.failed), run.some((s) => s.i === current))}>
        <button
          className="rail-run"
          title={`${run.length} steps`}
          popoverTarget={cardId}
          aria-expanded={open && first === shown}
          onClick={(e) => {
            if (open && first !== shown) e.preventDefault() // shows this run in the open card, instead of closing it
            const r = e.currentTarget.getBoundingClientRect()
            setAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
            setShown(first)
          }}
        />
      </span>
    )
  })
  if (nodes.length || running)
    nodes.push(
      <span key="end" className={stepClass(false, current === 'end')}>
        <button className="rail-pick" title="Jump to Latest Message" onClick={() => go('end')}>
          {running ? <Loader2 size={10} className="spin" /> : <Circle size={10} />}
        </button>
      </span>,
    )
  return (
    <>
      {/* Newest first in a row-reverse: the row opens scrolled to its right end, the newest step. */}
      <div className="rail" ref={rail}>
        {nodes.reverse()}
      </div>
      <div
        id={cardId}
        popover="auto"
        className="rail-card"
        style={{ '--x': `${at.x}px`, '--y': `${at.y}px` } as CSSProperties}
        onToggle={(e) => setOpen(e.newState === 'open')}
      >
        <div className="rail-card-box">
          {card.map((s) => (
            <button
              key={s.i}
              className={`rail-row${s.failed ? ' failed' : ''}${s.i === current ? ' current' : ''}`}
              onClick={() => go(s.i)}
            >
              <s.icon size={12} />
              <span className="truncate">{label(items[s.i])}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/** A card row's text. */
function label(item: TimelineItem): ReactNode {
  if (item.type === 'tool_call')
    return (
      <>
        <b>{item.name}</b> {toolArg(item)}
      </>
    )
  return item.type === 'reasoning' ? <i>{summary(item)}</i> : summary(item)
}

/** The item in a line. */
function summary(item: TimelineItem): string {
  const firstLine = (text: string) => text.replace(/\*\*|`/g, '').trim().split('\n')[0]
  switch (item.type) {
    case 'user_message':
    case 'assistant_message':
    case 'reasoning':
      return firstLine(item.text)
    case 'tool_call':
      return `${item.name} ${toolArg(item)}`
    case 'todo':
      return `Todos ${item.items.filter((t) => t.completed).length}/${item.items.length}`
    case 'error':
    case 'notification':
      return firstLine(item.message)
    case 'compaction':
      return 'Context compacted'
    default:
      return ''
  }
}

/** The item at the top of the chat, or its end once it's scrolled to the bottom (as `atBottom` in Chat.tsx). */
function currentItem(scroller: HTMLElement): number | 'end' | undefined {
  if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40) return 'end'
  const items = scroller.querySelectorAll<HTMLElement>('.timeline > [data-item]')
  const top = scroller.getBoundingClientRect().top + 1 // a pick's scrollIntoView can leave it a fraction below
  // The last item starting above the top: they're in order, so a binary search.
  let lo = 0
  let hi = items.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (items[mid].getBoundingClientRect().top <= top) lo = mid
    else hi = mid - 1
  }
  return items.length ? Number(items[lo].dataset.item) : undefined
}

const stepClass = (failed: boolean, current: boolean) => `rail-step${failed ? ' failed' : ''}${current ? ' current' : ''}`

function StepIcon({ step, current, title, onClick }: { step: Step; current: boolean; title: string; onClick: () => void }) {
  return (
    <span className={stepClass(step.failed, current)}>
      <button className="rail-pick" title={title} onClick={onClick}>
        <step.icon size={10} />
      </button>
    </span>
  )
}

const TOOL_ICONS: Partial<Record<ToolDetail['type'], LucideIcon>> = {
  shell: SquareTerminal,
  read: FileText,
  edit: FilePen,
  write: FilePlus,
  search: Search,
  fetch: Globe,
  sub_agent: Bot,
  worktree_setup: GitBranch,
  plan: ListTodo,
}
// Pi tools with untyped args arrive as `unknown`: go by the name.
const TOOL_NAME_ICONS: [RegExp, LucideIcon][] = [
  [/^bash/i, SquareTerminal],
  [/^read/i, FileText],
  [/^edit/i, FilePen],
  [/^write/i, FilePlus],
  [/grep|find|glob|search/i, Search],
  [/fetch/i, Globe],
]

/** Null for items the timeline doesn't show. */
function stepIcon(item: TimelineItem): LucideIcon | null {
  switch (item.type) {
    case 'user_message':
      return User
    case 'assistant_message':
      return MessageSquare
    case 'reasoning':
      return Brain
    case 'tool_call':
      return TOOL_ICONS[item.detail.type] ?? TOOL_NAME_ICONS.find(([re]) => re.test(item.name))?.[1] ?? Wrench
    case 'todo':
      return ListChecks
    case 'error':
      return CircleAlert
    case 'notification':
      return item.level === 'error' ? CircleAlert : Info
    case 'compaction':
      return Scissors
    default:
      return null
  }
}

const isFailed = (item: TimelineItem) =>
  item.type === 'error' ||
  (item.type === 'notification' && item.level === 'error') ||
  (item.type === 'tool_call' && (item.status === 'failed' || item.status === 'canceled'))
