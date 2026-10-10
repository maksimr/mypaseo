import {
  AlertTriangle,
  Bot,
  Brain,
  ChevronRight,
  FilePen,
  FilePlus,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  ListTodo,
  Loader2,
  Search,
  Terminal,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { memo, useState } from 'react'
import type { TimelineItem, ToolCall, ToolDetail } from '../daemon'
import { Code } from './Code'
import { Markdown } from './Markdown'

type Block = { kind: 'item'; item: TimelineItem } | { kind: 'tools'; items: ToolCall[] }

/** Consecutive tool calls collapse into one "Ran a command, read 2 files" row. */
function toBlocks(items: TimelineItem[]): Block[] {
  const blocks: Block[] = []
  for (const item of items) {
    const last = blocks.at(-1)
    if (item.type !== 'tool_call') blocks.push({ kind: 'item', item })
    else if (last?.kind === 'tools') last.items.push(item)
    else blocks.push({ kind: 'tools', items: [item] })
  }
  return blocks
}

export function Timeline({ items, running }: { items: TimelineItem[]; running: boolean }) {
  const blocks = toBlocks(items)
  const last = blocks.at(-1)
  const working = running && last?.kind !== 'tools' && !(last?.kind === 'item' && last.item.type === 'reasoning')
  return (
    <div className="timeline">
      {blocks.map((b, i) => {
        const live = running && i === blocks.length - 1
        return b.kind === 'tools' ? <ToolGroup key={i} tools={b.items} /> : <Item key={i} item={b.item} live={live} />
      })}
      {working && (
        <div className="msg">
          <Loader2 size={15} className="spin gutter-icon muted" />
          <span className="muted">Working…</span>
        </div>
      )}
    </div>
  )
}

const Item = memo(function Item({ item, live }: { item: TimelineItem; live: boolean }) {
  switch (item.type) {
    case 'user_message':
      return (
        <div className="msg user">
          <span className="avatar">
            <User size={14} />
          </span>
          <div className="user-text">{item.text}</div>
        </div>
      )
    case 'assistant_message':
      return (
        <div className="msg assistant">
          <Markdown text={item.text} />
        </div>
      )
    case 'reasoning':
      return <Reasoning text={item.text} live={live} />
    case 'todo':
      return (
        <div className="msg">
          <ListTodo size={15} className="gutter-icon muted" />
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
        <div className="msg error">
          <AlertTriangle size={15} className="gutter-icon" />
          <div className="pre-wrap">{item.message}</div>
        </div>
      )
    case 'notification':
      return (
        <div className={`msg ${item.level === 'error' ? 'error' : 'muted'}`}>
          <AlertTriangle size={15} className="gutter-icon" />
          <div className="pre-wrap">{item.message}</div>
        </div>
      )
    case 'compaction':
      return <div className="divider">{item.status === 'loading' ? 'Compacting context…' : 'Context compacted'}</div>
    default:
      return null
  }
})

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false)
  const summary = /^\s*\*\*(.+?)\*\*/.exec(text)?.[1] ?? text.trim().split('\n')[0]
  return (
    <div className="msg">
      {live ? <Loader2 size={15} className="spin gutter-icon muted" /> : <Brain size={15} className="gutter-icon muted" />}
      <div className="grow min0">
        <button className="disclosure" onClick={() => setOpen(!open)}>
          <span className="muted">Thinking:</span> <span className="truncate">{summary}</span>
          <ChevronRight size={13} className={open ? 'rot90' : ''} />
        </button>
        {open && (
          <div className="reasoning">
            <Markdown text={text} />
          </div>
        )}
      </div>
    </div>
  )
}

type ToolInfo = { icon: LucideIcon; phrase: [string, string]; label: string }

function toolInfo(t: ToolCall): ToolInfo {
  const d = t.detail
  switch (d.type) {
    case 'shell':
      return { icon: Terminal, phrase: ['ran a command', 'ran # commands'], label: d.command }
    case 'read':
      return { icon: FileText, phrase: ['read a file', 'read # files'], label: d.filePath }
    case 'edit':
      return { icon: FilePen, phrase: ['edited a file', 'edited # files'], label: d.filePath }
    case 'write':
      return { icon: FilePlus, phrase: ['wrote a file', 'wrote # files'], label: d.filePath }
    case 'search':
      return { icon: Search, phrase: ['searched', 'searched # times'], label: d.query }
    case 'fetch':
      return { icon: Globe, phrase: ['fetched a page', 'fetched # pages'], label: d.url }
    case 'sub_agent':
      return { icon: Bot, phrase: ['ran a subagent', 'ran # subagents'], label: d.description ?? d.subAgentType ?? t.name }
    case 'plan':
      return { icon: ListTodo, phrase: ['made a plan', 'made # plans'], label: 'Plan' }
    case 'worktree_setup':
      return { icon: GitBranch, phrase: ['set up a worktree', 'set up # worktrees'], label: d.branchName }
    case 'plain_text':
      return { icon: Wrench, phrase: ['used a tool', 'used # tools'], label: d.label ?? t.name }
    default: {
      const input = (d.input ?? {}) as Record<string, unknown>
      const arg = [input.path, input.file_path, input.command, input.pattern, input.query].find((v) => typeof v === 'string')
      const label = arg ? `${t.name} ${arg}` : t.name
      // Providers without typed details still use recognizable tool names.
      const known = Object.entries(BY_NAME).find(([re]) => new RegExp(re, 'i').test(t.name))?.[1]
      return known ? { ...known, label } : { icon: Wrench, phrase: ['used a tool', 'used # tools'], label }
    }
  }
}

const BY_NAME: Record<string, Omit<ToolInfo, 'label'>> = {
  '^(bash|shell|exec)': { icon: Terminal, phrase: ['ran a command', 'ran # commands'] },
  '^read': { icon: FileText, phrase: ['read a file', 'read # files'] },
  '^(edit|multiedit|apply_patch)': { icon: FilePen, phrase: ['edited a file', 'edited # files'] },
  '^write': { icon: FilePlus, phrase: ['wrote a file', 'wrote # files'] },
  '^(grep|find|glob|search)': { icon: Search, phrase: ['searched', 'searched # times'] },
  '^ls$': { icon: FolderOpen, phrase: ['listed a directory', 'listed # directories'] },
}

function summarize(tools: ToolCall[]) {
  const counts = new Map<string, { phrase: [string, string]; n: number }>()
  for (const t of tools) {
    const { phrase } = toolInfo(t)
    const c = counts.get(phrase[0]) ?? { phrase, n: 0 }
    c.n++
    counts.set(phrase[0], c)
  }
  const text = [...counts.values()].map((c) => (c.n === 1 ? c.phrase[0] : c.phrase[1].replace('#', String(c.n)))).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ToolGroup({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false)
  const running = tools.some((t) => t.status === 'running')
  const failed = tools.some((t) => t.status === 'failed')
  const Icon = tools.length === 1 ? toolInfo(tools[0]).icon : Wrench
  return (
    <div className="msg">
      {running ? <Loader2 size={15} className="spin gutter-icon muted" /> : <Icon size={15} className="gutter-icon muted" />}
      <div className="grow min0">
        <button className="disclosure" onClick={() => setOpen(!open)}>
          <span className={failed ? 'err' : undefined}>{summarize(tools)}</span>
          <ChevronRight size={13} className={open ? 'rot90' : ''} />
        </button>
        {open && (
          <div className="tool-list">
            {tools.map((t) => (
              <ToolRow key={t.callId} tool={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const { icon: Icon, label } = toolInfo(tool)
  return (
    <div className="tool">
      <button className="tool-head" onClick={() => setOpen(!open)}>
        {tool.status === 'running' ? <Loader2 size={13} className="spin" /> : <Icon size={13} />}
        <span className="truncate grow">{label}</span>
        {tool.status === 'failed' && <span className="err">failed</span>}
        {tool.status === 'canceled' && <span className="muted">canceled</span>}
      </button>
      {open && (
        <div className="tool-body">
          <ToolDetailView detail={tool.detail} />
          {tool.error != null && <pre className="term err">{stringify(tool.error)}</pre>}
        </div>
      )}
    </div>
  )
}

const stringify = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))

export function ToolDetailView({ detail: d }: { detail: ToolDetail }) {
  switch (d.type) {
    case 'shell':
      return (
        <pre className="term">
          <span className="muted">$ </span>
          {d.command}
          {d.output ? `\n${d.output}` : ''}
          {d.exitCode ? `\n[exit ${d.exitCode}]` : ''}
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
        <pre className="term">
          {d.content ?? d.filePaths?.join('\n') ?? d.webResults?.map((r) => `${r.title}\n  ${r.url}`).join('\n') ?? d.query}
        </pre>
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
