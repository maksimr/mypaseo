import { ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { doing, summary, type Step } from './work'

/** A run of tool calls and thoughts, collapsed into one row: while the agent is on it, what it's doing and for how
 *  long (since the user's last message); once done, what it did. Opens to the steps. */
export function WorkGroup({
  index,
  steps,
  live,
  since,
  expanded,
  children,
}: {
  index: number
  steps: Step[]
  live: boolean
  since?: string | null
  expanded: boolean
  children: ReactNode
}) {
  // As in ToolRow: a click overrides the expand shortcut's state until it's pressed again.
  const [open, setOpen] = useState(expanded)
  const [all, setAll] = useState(expanded)
  if (all !== expanded) {
    setAll(expanded)
    setOpen(expanded)
  }
  return (
    // <details>: find in page opens it to a match.
    <details className="work" data-item={index} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary
        className="work-head"
        onClick={(e) => {
          // Closed while stuck (chat.css), it would leave the view on what came after it: bring it back to the top.
          const d = e.currentTarget.parentElement as HTMLDetailsElement
          if (!d.open || d.getBoundingClientRect().top >= e.currentTarget.getBoundingClientRect().top) return
          e.preventDefault()
          d.open = false
          d.scrollIntoView({ block: 'start' })
        }}
      >
        {live ? (
          <>
            <Loader2 size={13} className="spin" />
            <Now step={steps.at(-1)!} />
            {since && <Elapsed since={since} />}
          </>
        ) : (
          <Done steps={steps} />
        )}
        <ChevronRight size={12} className="work-chevron" />
      </summary>
      {children}
    </details>
  )
}

function Now({ step }: { step: Step }) {
  const label = doing(step)
  // Keyed: a new label slides in (chat.css).
  return (
    <span key={label} className="work-now truncate">
      {label}
    </span>
  )
}

function Done({ steps }: { steps: Step[] }) {
  const { text, failed } = summary(steps)
  return (
    <span className="truncate">
      {text}
      {failed > 0 && (
        <>
          , <span className="work-failed">{failed} failed</span>
        </>
      )}
    </span>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000))
  return <span className="work-time">{s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}</span>
}
