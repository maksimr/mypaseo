import { ArrowDown, Import, SquarePen } from 'lucide-react'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActiveViewContext } from '../../activeView'
import { artifactDocs } from '../../artifact'
import type { Agent } from '../../daemon'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import type { ReviewComment } from '../review/review'
import { isScratch, keptUnread, useDaemon } from '../../store'
import { useTimeline } from './useTimeline'
import { Timeline } from './Timeline'
import { Composer } from './Composer'
import { PermissionCard } from './PermissionCard'
import type { Target } from './target'

/** Whether the user is writing in the composer: it has focus and unsent text. */
const typing = (composer: HTMLElement | null) => {
  const a = document.activeElement
  return a instanceof HTMLTextAreaElement && !!composer?.contains(a) && a.value !== ''
}

export function Chat({
  agent,
  target,
  onCreated,
  onImport,
  initialText,
  onInitialTextUsed,
  onProjectChange,
  onDraftProvider,
  onShowComment,
  reveal,
}: {
  agent: Agent | undefined
  target: Target
  onCreated: (agent: Agent) => void
  onImport: () => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string) => void
  onDraftProvider?: (provider: string | undefined) => void
  onShowComment: (c: ReviewComment) => void
  /** An artifact to scroll to, by its iframe document; a new object scrolls again. */
  reveal?: { doc: string }
}) {
  const daemon = useDaemon()
  const tl = useTimeline(agent?.id ?? null)
  const running = agent?.status === 'running'
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [away, setAway] = useState(false)
  // Scrolling up to read hides the composer; reaching the bottom or Write Message brings it back.
  // Pending permissions keep it, so the floating button never covers their cards.
  const foot = useRef<HTMLDivElement>(null)
  const lastTop = useRef(0)
  const [hide, setHide] = useState(false)
  const composerHidden = hide && !agent?.pendingPermissions.length
  const jumpKey = useShortcut('jumpToLatest')
  const jumpToLatest = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'jumpToLatest')) return
      if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault() // Ctrl+End still moves the composer caret
      jumpToLatest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // Stick to the bottom while streaming unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [tl.items, agent?.pendingPermissions.length])
  // And while the chat or its timeline resizes, as when the composer slides in or grows, or markdown near the bottom gets parsed.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    const content = el.querySelector('.timeline')
    if (content) ro.observe(content)
    ro.observe(el.querySelector('.chat-foot')!)
    return () => ro.disconnect()
  }, [])
  // Waits for the whole timeline: the first page is only its tail, and the rest arriving would shift the message.
  const revealed = useRef<typeof reveal>(undefined)
  useEffect(() => {
    const el = scroller.current
    if (!el || !reveal || reveal === revealed.current || tl.loading || tl.partial) return
    const i = tl.items.findLastIndex((x) => x.type === 'assistant_message' && artifactDocs(x.text).includes(reveal.doc))
    const msg = el.querySelector(`[data-item="${i}"]`)
    if (!msg) return
    revealed.current = reveal
    atBottom.current = false // else sticking to the bottom scrolls it away again
    // Markdown parses a message only once it nears the viewport (Markdown.tsx): go to the message, then to its iframe.
    msg.scrollIntoView({ block: 'start' })
    let frames = 60
    const toIframe = () => {
      const f = [...msg.querySelectorAll('iframe')].find((f) => f.srcdoc === reveal.doc)
      if (!f) {
        if (--frames) requestAnimationFrame(toIframe)
        return
      }
      // The page sizes itself once its scripts run: keep its top in view meanwhile, over sticking to the bottom.
      const ro = new ResizeObserver(() => {
        atBottom.current = false
        f.scrollIntoView({ block: 'start' })
      })
      ro.observe(f)
      setTimeout(() => ro.disconnect(), 3000)
    }
    toIframe()
  }, [reveal, tl])
  // Viewing an agent acknowledges its "finished" / "error" attention flag, except a Mark Unread made while it's open.
  // A chat kept mounted behind another tab isn't viewed.
  const agentId = agent?.id
  useEffect(() => {
    if (active && agentId) keptUnread.delete(agentId) // opening it reads it
  }, [active, agentId])
  useEffect(() => {
    if (!active) return
    if (agentId && !agent?.requiresAttention) keptUnread.delete(agentId) // so finishing again while open reads it
    else if (agent?.requiresAttention && !agent.pendingPermissions.length && !keptUnread.has(agentId!)) void daemon.clearAgentAttention(agentId!).catch(() => {})
  }, [active, daemon, agentId, agent?.requiresAttention, agent?.pendingPermissions.length])

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
          const up = el.scrollTop < lastTop.current
          lastTop.current = el.scrollTop
          atBottom.current = fromBottom < 40
          setAway(!atBottom.current)
          if (atBottom.current) setHide(false)
          // Only this far up does the space it frees stay short of the bottom; else it would show again at once.
          else if (up && fromBottom > (foot.current?.offsetHeight ?? 0) + 40 && !typing(foot.current)) {
            setHide(true)
            foot.current?.querySelector('textarea')?.blur() // closes a touch keyboard
          }
        }}
      >
        {agent ? (
          <>
            {tl.loading && <div className="empty">Loading…</div>}
            {tl.error && <div className="empty err">{tl.error}</div>}
            <Timeline items={tl.items} running={running} />
            {agent.lastError && agent.status === 'error' && <div className="msg error pre-wrap">{agent.lastError}</div>}
          </>
        ) : (
          <div className="empty-chat">
            <h2>New agent</h2>
            <p className="muted">
              {target.workspace
                ? `Starts in ${target.workspace.title || target.workspace.name}`
                : isScratch(target.rootPath)
                  ? 'Starts a new scratch'
                  : `Starts a new workspace in ${target.name}`}
            </p>
            <button className="btn ghost" onClick={onImport}>
              <Import size={13} /> Import Session
            </button>
          </div>
        )}
        {/* Measured here, not on the composer's div: its bottom margin collapses out of that one. */}
        <div className="chat-foot" ref={foot}>
          {agent && away && (
            <button className="jump-latest" onClick={jumpToLatest}>
              <ArrowDown size={13} /> Jump to Latest Message ({formatCombo(jumpKey)})
            </button>
          )}
          {agent?.pendingPermissions.map((p) => <PermissionCard key={p.id} agentId={agent.id} request={p} />)}
          {/* Hidden, not unmounted: the draft and attachments stay. */}
          <div hidden={composerHidden}>
            <Composer
              agent={agent}
              target={target}
              onCreated={onCreated}
              initialText={initialText}
              onInitialTextUsed={onInitialTextUsed}
              onProjectChange={onProjectChange}
              onDraftProvider={onDraftProvider}
              onShowComment={onShowComment}
            />
          </div>
          {composerHidden && (
            <button
              className="show-composer"
              title="Write Message"
              aria-label="Write Message"
              onClick={() => {
                flushSync(() => setHide(false))
                foot.current?.querySelector('textarea')?.focus({ preventScroll: true }) // within the tap, so touch keyboards open
              }}
            >
              <SquarePen size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
