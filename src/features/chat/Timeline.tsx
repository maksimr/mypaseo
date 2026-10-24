import { ArrowDownFromLine, Loader2, Lock } from 'lucide-react'
import { Fragment, memo, useContext, useEffect, useMemo, useState } from 'react'
import { ActiveViewContext } from '../../activeView'
import { errorText, type Agent, type TimelineItem, type ToolCall, type ToolDetail } from '../../daemon'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import { Code } from '../../components/Code'
import { Markdown } from '../../components/Markdown'
import { ProviderIcon } from '../../components/ProviderIcon'
import * as rooms from '../../rooms'
import { useDaemon } from '../../store'
import type { RoomItem } from '../rooms/roomView'
import { shareable } from './share'
import { toolArg } from './toolArg'
import { rows, type Row } from './work'
import { WorkGroup } from './WorkGroup'

type Member = { agent: Agent; handle: string }

// A member's direct replies run apart from its public ones.
const authorKey = (r: RoomItem) => `${r.agentId}${r.private ? ' dm' : ''}`

export function Timeline({
  items,
  members,
  room,
  onShare,
}: {
  items: TimelineItem[]
  /** Whose items these are: the chat's agent, or a room's members. A running one shows what it's doing (its steps
   *  count their time from its last message), a failed one its error. */
  members: Member[]
  /** In a room: who wrote each item, at the same index as items. */
  room?: RoomItem[]
  /** In a room: Share From Here on a message; `end` with Shift. */
  onShare?: (r: RoomItem, end: boolean) => void
}) {
  // Like pi's Ctrl+O (here Ctrl+" by default): expand or collapse every tool output at once.
  const [expanded, setExpanded] = useState(false)
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'expandTools')) return
      e.preventDefault()
      setExpanded((x) => !x)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
  const grouped = useMemo(() => rows(items, room && ((i) => authorKey(room[i]))), [items, room])
  const agentAt = (row: Row) => (room ? room[row.index].agentId : members[0]?.agent.id)
  // A running agent's last steps show it themselves; one without them gets a Working… line.
  const live = new Map<Row, Member>()
  const working: Member[] = []
  for (const m of members.filter((m) => m.agent.status === 'running')) {
    const last = grouped.findLast((r) => agentAt(r) === m.agent.id)
    if (last && 'steps' in last) live.set(last, m)
    else working.push(m)
  }
  const byId = new Map(members.map((m) => [m.agent.id, m]))
  // In a room, a member's run of messages and steps opens with its name.
  const speaker = (row: Row | undefined) => {
    const r = row && room?.[row.index]
    return r && r.author !== 'user' && r.item.type !== 'plugin' ? r : undefined
  }
  // What the user wrote straight into a member's chat went to that member.
  const to = (row: Row) => (room?.[row.index].author === 'user' ? `to @${byId.get(room[row.index].agentId)?.handle}` : undefined)
  const resumed = items.findLastIndex((x) => x.type === 'plugin' && x.kind === 'room.resumed')
  const share = (i: number) => !!onShare && !!room && shareable(room[i])
  return (
    // Share From Here clicks are handled here: the memoized items take no callback, which would change with the room.
    <div
      className="timeline"
      onClick={(e) => {
        const at = (e.target as Element).closest('.share-here')?.closest<HTMLElement>('[data-item]')
        if (at && room) onShare?.(room[Number(at.dataset.item)], e.shiftKey)
      }}
    >
      {grouped.map((row, k) => {
        const who = speaker(row)
        const prev = speaker(grouped[k - 1])
        const author = who && (!prev || authorKey(who) !== authorKey(prev)) ? byId.get(who.agentId) : undefined
        return (
          // Keyed by the room's key: other members' items arriving shift the indices.
          <Fragment key={room ? room[row.index].key : row.index}>
            {author && (
              <div className="msg-author">
                <ProviderIcon provider={author.agent.provider} size={13} />@{author.handle}
                {who?.private && <> · <Direct /></>}
              </div>
            )}
            {'steps' in row ? (
              <WorkGroup index={row.index} steps={row.steps} live={live.has(row)} since={live.get(row)?.agent.lastUserMessageAt} expanded={expanded}>
                {row.steps.map((item, i) => (
                  <Item key={i} index={row.index + i} item={item} expanded={expanded} />
                ))}
              </WorkGroup>
            ) : room && row.item.type === 'plugin' ? (
              <RoomEvent index={row.index} roomId={room[row.index].agentId} item={row.item} open={row.index > resumed} share={share(row.index)} />
            ) : (
              <Item index={row.index} item={row.item} expanded={expanded} to={to(row)} share={share(row.index)} />
            )}
          </Fragment>
        )
      })}
      {working.map((m) => (
        <div key={m.agent.id} className="msg muted working">
          <Loader2 size={13} className="spin" /> {room ? `@${m.handle} is working…` : 'Working…'}
        </div>
      ))}
      {members.map(
        ({ agent: a, handle }) =>
          a.status === 'error' &&
          a.lastError && (
            <div key={a.id} className="msg error pre-wrap">
              {room ? `@${handle}: ${a.lastError}` : a.lastError}
            </div>
          ),
      )}
    </div>
  )
}

/** The lock badge of a direct message and of the replies to it, which the room doesn't route. */
const Direct = () => (
  <span className="direct">
    <Lock size={11} />
    direct
  </span>
)

/** Share From Here on a room message; Timeline handles its click. */
function ShareButton() {
  const key = useShortcut('shareFromHere')
  return (
    <button className="icon-btn share-here" title={`Share From Here (${formatCombo(key)})`}>
      <ArrowDownFromLine size={13} />
    </button>
  )
}

/** `meta`: whom it went to, and what came with it. */
function UserMessage({ index, text, meta, dm, share }: { index: number; text: string; meta?: string; dm?: boolean; share?: boolean }) {
  return (
    <div className="msg user" data-item={index}>
      {share && <ShareButton />}
      {meta && (
        <div className="msg-to">
          {meta}
          {dm && <> · <Direct /></>}
        </div>
      )}
      <div className="user-text">{text}</div>
    </div>
  )
}

const mentions = (handles: string[]) => handles.map((h) => `@${h}`).join(', ')
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** A mypaseo-rooms item (Room items in doc/multi-agent-chat.md): the user's post, or a line about the room. A pause
 *  not yet ended (`open`) offers Continue. */
function RoomEvent({
  index,
  roomId,
  item,
  open,
  share,
}: {
  index: number
  roomId: string
  item: Extract<TimelineItem, { type: 'plugin' }>
  open: boolean
  share: boolean
}) {
  const daemon = useDaemon()
  const [busy, setBusy] = useState(false)
  switch (item.kind) {
    case 'room.post': {
      const p = item.data as { text: string; to: string[]; dm: boolean; images: number; files: string[] }
      const meta = [p.to.length ? `to ${mentions(p.to)}` : 'to everyone', ...(p.images ? [count(p.images, 'image')] : []), ...p.files]
      return <UserMessage index={index} text={p.text} meta={meta.join(' · ')} dm={p.dm} share={share} />
    }
    case 'room.join': {
      const j = item.data as { handles: string[]; context: string }
      return (
        <div className="divider" data-item={index}>
          {mentions(j.handles)} joined · {j.context}
        </div>
      )
    }
    case 'room.leave':
      return (
        <div className="divider" data-item={index}>
          @{(item.data as { handle: string }).handle} left
        </div>
      )
    case 'room.paused':
      return (
        <div className="divider" data-item={index}>
          Paused after 6 agent hand-offs · {count((item.data as { held: number }).held, 'message')} held
          {open && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                rooms
                  .resume(daemon, { roomId })
                  .catch((e) => alert(`Continue failed: ${errorText(e)}`))
                  .finally(() => setBusy(false))
              }}
            >
              Continue
            </button>
          )}
        </div>
      )
    default: // room.resumed: the pause before it loses its Continue
      return null
  }
}

const Item = memo(function Item({ index, item, expanded, to, share }: { index: number; item: TimelineItem; expanded: boolean; to?: string; share?: boolean }) {
  switch (item.type) {
    case 'user_message':
      return <UserMessage index={index} text={item.text} meta={to} />
    case 'assistant_message':
      return (
        <div className="msg assistant" data-item={index}>
          {share && <ShareButton />}
          <Markdown text={item.text} />
        </div>
      )
    case 'reasoning':
      return (
        <div className="msg thinking" data-item={index}>
          <Markdown text={item.text} />
        </div>
      )
    case 'tool_call':
      return <ToolRow index={index} tool={item} expanded={expanded} />
    case 'todo':
      return (
        <div className="msg" data-item={index}>
          <ul className="todo">
            {item.items.map((t, i) => (
              <li key={t.id ?? i} className={t.completed ? 'done' : t.status === 'in_progress' ? 'doing' : ''}>
                <input type="checkbox" checked={t.completed} readOnly /> {t.text}
              </li>
            ))}
          </ul>
        </div>
      )
    case 'error':
      return (
        <div className="msg error" data-item={index}>
          <div className="pre-wrap">{item.message}</div>
        </div>
      )
    case 'notification':
      return (
        <div className={`msg ${item.level === 'error' ? 'error' : 'muted'}`} data-item={index}>
          <div className="pre-wrap">{item.message}</div>
        </div>
      )
    case 'compaction':
      return <div className="divider" data-item={index}>{item.status === 'loading' ? 'Compacting context…' : 'Context compacted'}</div>
    default:
      return null
  }
})

/** Pi-style tool box: green when it succeeded, red when it failed or was canceled. */
function ToolRow({ index, tool, expanded }: { index: number; tool: ToolCall; expanded: boolean }) {
  const d = tool.detail
  const expandKey = useShortcut('expandTools')
  // A click overrides the shortcut's state for this row until the shortcut is pressed again.
  const [open, setOpen] = useState(expanded)
  const [all, setAll] = useState(expanded)
  if (all !== expanded) {
    setAll(expanded)
    setOpen(expanded)
  }
  const toggle = () => {
    if (!getSelection()?.toString()) setOpen(!open) // selecting text to copy shouldn't toggle
  }
  // File contents are long and rarely interesting. Pi reads with untyped args arrive as `unknown`, hence the name check.
  const isRead = d.type === 'read' || /^read/i.test(tool.name)
  const out = isRead ? '' : textOutput(d)?.trimEnd()
  const lines = out?.split('\n') ?? []
  const hidden = open ? 0 : Math.max(0, lines.length - PREVIEW_LINES)
  return (
    <div className={`tool ${tool.status}`} data-item={index}>
      {/* Not a <button>: browsers don't select text in one, and the command should copy. */}
      <div
        className="tool-head"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          setOpen(!open)
        }}
      >
        {d.type === 'shell' ? (
          `$ ${d.command}`
        ) : (
          <>
            <b>{tool.name}</b> <span className="tool-arg">{toolArg(tool)}</span>
          </>
        )}
      </div>
      {out !== '' && (
        <div className="tool-body">
          {out == null ? (
            <ToolDetailView detail={d} />
          ) : (
            <pre className="term" onClick={toggle}>
              {hidden > 0 && (
                <span className="muted">
                  … ({hidden} earlier lines, {formatCombo(expandKey)} to expand){'\n'}
                </span>
              )}
              {lines.slice(hidden).join('\n')}
            </pre>
          )}
        </div>
      )}
      {tool.error != null && <pre className="tool-body term err">{stringify(tool.error)}</pre>}
    </div>
  )
}

// Collapsed output shows its last lines, like pi's bash tool.
const PREVIEW_LINES = 5

/** Plain-text output, which collapses; undefined for diffs, code and other rich output. */
function textOutput(d: ToolDetail): string | undefined {
  switch (d.type) {
    case 'shell':
      return shellOutput(d)
    case 'search':
      return d.content ?? d.filePaths?.join('\n') ?? d.webResults?.map((r) => `${r.title}\n  ${r.url}`).join('\n') ?? ''
    case 'fetch':
      return d.result ?? ''
    case 'sub_agent':
    case 'worktree_setup':
      return d.log
    case 'plain_text':
      return d.text ?? ''
    case 'unknown':
      return outputText(d.output)
    default:
      return undefined
  }
}

/** Text of a pi-style `{ content: [{ type: 'text', text }] }` result; undefined when it has another shape. */
function outputText(output: unknown): string | undefined {
  if (typeof output === 'string') return output
  const content = (output as { content?: { type: string; text?: string }[] } | null)?.content
  return content?.flatMap((c) => (c.type === 'text' ? [c.text ?? ''] : [])).join('\n')
}

const shellOutput = (d: Extract<ToolDetail, { type: 'shell' }>) =>
  [d.output, d.exitCode ? `[exit ${d.exitCode}]` : ''].filter(Boolean).join('\n')

const stringify = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))

export function ToolDetailView({ detail: d }: { detail: ToolDetail }) {
  switch (d.type) {
    case 'shell':
      return (
        <pre className="term">
          <span className="muted">$ </span>
          {d.command}
          {shellOutput(d) && `\n${shellOutput(d)}`}
        </pre>
      )
    case 'read':
      return d.content ? <Code code={d.content} filename={d.filePath} /> : <div className="muted">{d.filePath}</div>
    case 'write':
      return d.content ? <Code code={d.content} filename={d.filePath} /> : <div className="muted">{d.filePath}</div>
    case 'edit':
      return <InlineDiff text={d.unifiedDiff ?? toDiff(d.oldString, d.newString)} />
    case 'search':
      return (
        <pre className="term">{textOutput(d) || d.query}</pre>
      )
    case 'fetch':
      return <pre className="term">{d.result ?? d.url}</pre>
    case 'sub_agent':
      return <pre className="term">{d.log}</pre>
    case 'plan':
      return <Markdown text={d.text} />
    case 'worktree_setup':
      return <pre className="term">{d.log}</pre>
    case 'plain_text':
      return <pre className="term">{d.text ?? ''}</pre>
    default:
      return (
        <pre className="term">
          {stringify(d.input)}
          {d.output != null && `\n\n${stringify(d.output)}`}
        </pre>
      )
  }
}

const toDiff = (oldText = '', newText = '') =>
  [...(oldText ? oldText.split('\n').map((l) => `-${l}`) : []), ...(newText ? newText.split('\n').map((l) => `+${l}`) : [])].join('\n')

function InlineDiff({ text }: { text: string }) {
  return (
    <pre className="term diff-inline">
      {text.split('\n').map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'muted' : ''}>
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}
