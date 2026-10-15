import { ArrowDown, Import, SquarePen } from 'lucide-react'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActiveViewContext } from '../../activeView'
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
    return () => ro.disconnect()
  }, [])
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
            {away && (
              <button className="jump-latest" onClick={jumpToLatest}>
                <ArrowDown size={13} /> Jump to Latest Message ({formatCombo(jumpKey)})
              </button>
            )}
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
      </div>
      {agent?.pendingPermissions.map((p) => <PermissionCard key={p.id} agentId={agent.id} request={p} />)}
      {/* Hidden, not unmounted: the draft and attachments stay. */}
      <div ref={foot} hidden={composerHidden}>
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
  )
}
