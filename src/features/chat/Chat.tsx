import { ArrowDown, Import, Reply } from 'lucide-react'
import { Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActiveViewContext } from '../../activeView'
import { artifactDocs } from '../../artifact'
import { parseNear } from '../../components/Markdown'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Loading } from '../../components/Spinner'
import type { Agent, TimelineItem } from '../../daemon'
import { useDefaultAgent } from '../../defaultAgent'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import type { ReviewComment } from '../review/review'
import { handleOf, isLead, lookOf, roomId, roomMembers } from '../rooms/members'
import { ProfileIcon } from '../rooms/ProfileIcon'
import { isScratch, keptUnread, useDaemon, useHost } from '../../store'
import { useRoomTimeline } from './useRoomTimeline'
import { useTimeline } from './useTimeline'
import { Timeline } from './Timeline'
import { Composer } from './Composer'
import { ContextCard } from './ContextCard'
import { PermissionCard } from './PermissionCard'
import { itemAcross } from './reading'
import { ownMarks, roomMarks, type Mark } from './share'
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
  const { agents, profiles } = useHost()
  const defaultAgent = useDefaultAgent()
  // A room's lead shows the room; any other agent, a member included (its own chat), its own timeline.
  const lead = agent && isLead(agent) ? agent : undefined
  const members = lead ? [lead, ...roomMembers(agents, lead.id).filter((m) => m.id !== lead.id)] : agent ? [agent] : []
  const named = members.map((m) => ({ agent: m, handle: handleOf(m, profiles), ...lookOf(m, profiles, defaultAgent) }))
  const roomTl = useRoomTimeline(lead?.id ?? null, named.map((m) => ({ agentId: m.agent.id, handle: m.handle, running: m.agent.status === 'running' })))
  const ownTl = useTimeline(lead ? null : (agent?.id ?? null))
  const tl: { items: TimelineItem[]; loading: boolean; error: string | null; partial?: boolean } = lead ? roomTl : ownTl
  const permissions = named.flatMap((m) => m.agent.pendingPermissions.map((request) => ({ ...m, request })))
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  // Away from the bottom, a button jumps there.
  const [away, setAway] = useState(false)
  const jumpKey = useShortcut('jumpToLatest')
  // Scrolling up to read hides the composer; reaching the bottom or Write Message brings it back.
  // Pending permissions keep it, so the floating button never covers their cards.
  const foot = useRef<HTMLDivElement>(null)
  const lastTop = useRef(0)
  const [hide, setHide] = useState(false)
  const composerHidden = hide && !permissions.length
  const jumpToLatest = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }
  const showComposer = () => {
    flushSync(() => setHide(false))
    foot.current?.querySelector('textarea')?.focus({ preventScroll: true }) // within the tap, so touch keyboards open
  }
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (isShortcut(e, 'focusComposer')) {
        e.preventDefault()
        showComposer()
      }
      if (!isShortcut(e, 'jumpToLatest')) return
      if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault() // Ctrl+End still moves the composer caret
      jumpToLatest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
  // Share From Here: the composer sets its joining chips' context from the message, so it shows to take them.
  const [share, setShare] = useState<{ mark: Mark; end: boolean }>()
  const shareFrom = (mark: Mark, end: boolean) => {
    setShare({ mark, end })
    showComposer()
  }
  // It works in a room, and in a chat without one (for a fork); not in a member's own chat.
  const room = lead ? roomTl.room : undefined
  const solo = agent && !lead && !roomId(agent) ? { id: agent.id, handle: handleOf(agent, profiles) } : undefined
  const own = useMemo(
    () => (solo ? ownMarks(ownTl.items, ownTl.times, solo.id, solo.handle) : undefined),
    [solo?.id, solo?.handle, ownTl], // eslint-disable-line react-hooks/exhaustive-deps -- solo, by its fields
  )
  const marks = useMemo(() => (room ? roomMarks(room) : own), [room, own])
  // Its shortcut takes the message across the reading line, or the last one before it; with Shift, the end.
  useEffect(() => {
    if (!active || !marks) return
    const onKey = (e: KeyboardEvent) => {
      const plain = isShortcut(e, 'shareFromHere')
      if (!plain && !(e.shiftKey && isShortcut({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: false, metaKey: e.metaKey }, 'shareFromHere'))) return
      e.preventDefault()
      const at = scroller.current && itemAcross(scroller.current)
      const m = at == null ? undefined : marks.findLast((m, i) => i <= at && m)
      if (m) shareFrom(m, !plain)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, marks]) // eslint-disable-line react-hooks/exhaustive-deps -- shareFrom only sets state and focuses

  // Stick to the bottom while streaming unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    parseNear(el) // else opening a chat paints its messages raw for a frame, then parsed
  }, [tl.items, permissions.length])
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
  // The room shows its members' replies: viewing it reads them too.
  const unreadMembers = members
    .filter((m) => m !== agent && m.requiresAttention && !m.pendingPermissions.length && !keptUnread.has(m.id))
    .map((m) => m.id)
    .join()
  useEffect(() => {
    if (active && unreadMembers) for (const id of unreadMembers.split(',')) void daemon.clearAgentAttention(id).catch(() => {})
  }, [active, daemon, unreadMembers])

  return (
    <div className="chat">
      <ContextCard cwd={target.workspace?.workspaceDirectory} members={lead && named} />
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
            {tl.loading && <Loading />}
            {tl.error && <div className="empty err">{tl.error}</div>}
            <Timeline items={tl.items} members={named} room={room} times={ownTl.times} marks={marks} onShare={shareFrom} />
          </>
        ) : (
          <div className="empty-chat new-agent">
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
          {permissions.map(({ request, agent: m, handle, color, icon }) => (
            <Fragment key={`${m.id}:${request.id}`}>
              {lead && (
                <div className="permission-from">
                  <ProfileIcon icon={icon} color={color} size={13} fallback={<ProviderIcon provider={m.provider} size={13} />} />@{handle}
                </div>
              )}
              <PermissionCard agentId={m.id} request={request} />
            </Fragment>
          ))}
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
              share={share}
              forks={own?.filter((f) => f !== undefined)}
            />
          </div>
          {(away || composerHidden) && (
            <div className="chat-float">
              {composerHidden && (
                <button title="Reply" onClick={showComposer}>
                  <Reply size={14} /> Reply
                </button>
              )}
              {away && (
                <button className="jump-latest" title={`Jump to Latest Message (${formatCombo(jumpKey)})`} onClick={jumpToLatest}>
                  <ArrowDown size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
