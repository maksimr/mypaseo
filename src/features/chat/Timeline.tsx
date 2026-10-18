import { Loader2 } from 'lucide-react'
import { memo, useContext, useEffect, useState } from 'react'
import { ActiveViewContext } from '../../activeView'
import type { TimelineItem, ToolCall, ToolDetail } from '../../daemon'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import { Code } from '../../components/Code'
import { Markdown } from '../../components/Markdown'
import { toolArg } from './toolArg'

export function Timeline({ items, running }: { items: TimelineItem[]; running: boolean }) {
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
  return (
    <div className="timeline">
      {items.map((item, i) => (
        <Item key={i} index={i} item={item} expanded={expanded} />
      ))}
      {running && (
        <div className="msg muted working">
          <Loader2 size={13} className="spin" /> Working…
        </div>
      )}
    </div>
  )
}

const Item = memo(function Item({ index, item, expanded }: { index: number; item: TimelineItem; expanded: boolean }) {
  switch (item.type) {
    case 'user_message':
      return (
        <div className="msg user" data-item={index}>
          <div className="user-text">{item.text}</div>
        </div>
      )
    case 'assistant_message':
      return (
        <div className="msg" data-item={index}>
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
      <button className="tool-head" onClick={toggle}>
        {d.type === 'shell' ? (
          `$ ${d.command}`
        ) : (
          <>
            <b>{tool.name}</b> <span className="tool-arg">{toolArg(tool)}</span>
          </>
        )}
      </button>
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
