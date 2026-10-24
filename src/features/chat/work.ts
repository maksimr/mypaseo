import type { TimelineItem, ToolCall } from '../../daemon'
import { toolArg } from './toolArg.ts'

/** A tool call or a thought: the runs of them between the other items collapse into one row each (WorkGroup.tsx). */
export type Step = ToolCall | Extract<TimelineItem, { type: 'reasoning' }>

/** The timeline's rows: an item on its own, or a run of steps. `index` is the (first) item's in the timeline. */
export type Row = { index: number; item: TimelineItem } | { index: number; steps: Step[] }

const isStep = (item: TimelineItem): item is Step => item.type === 'tool_call' || item.type === 'reasoning'

/** `author`: in a room, who wrote the item at an index; a run of steps splits where it changes. */
export function rows(items: TimelineItem[], author?: (index: number) => string): Row[] {
  const out: Row[] = []
  items.forEach((item, index) => {
    const last = out.at(-1)
    if (!isStep(item)) out.push({ index, item })
    else if (last && 'steps' in last && author?.(last.index) === author?.(index)) last.steps.push(item)
    else out.push({ index, steps: [item] })
  })
  return out
}

type Kind = 'command' | 'read' | 'edit' | 'write' | 'search' | 'fetch' | 'agent' | 'tool'

function kind(t: ToolCall): Kind {
  switch (t.detail.type) {
    case 'shell':
      return 'command'
    case 'read':
    case 'edit':
    case 'write':
    case 'search':
    case 'fetch':
      return t.detail.type
    case 'sub_agent':
      return 'agent'
    case 'unknown': // pi's tools with untyped args, by name
      return BY_NAME.find(([re]) => re.test(t.name))?.[1] ?? 'tool'
    default:
      return 'tool'
  }
}

const BY_NAME: [RegExp, Kind][] = [
  [/^read/i, 'read'],
  [/^(bash|shell)/i, 'command'],
  [/^edit/i, 'edit'],
  [/^write/i, 'write'],
  [/^(grep|find|glob|ls)\b/i, 'search'],
]

const FILES: Kind[] = ['read', 'edit', 'write']

const DOING: Record<Kind, string> = {
  command: 'Running',
  read: 'Reading',
  edit: 'Editing',
  write: 'Writing',
  search: 'Searching',
  fetch: 'Fetching',
  agent: 'Running agent',
  tool: 'Running',
}

/** What the step is doing, for the row while it runs: "Reading models.py". */
export function doing(step: Step): string {
  if (step.type === 'reasoning') return 'Thinking'
  const k = kind(step)
  const arg = k === 'tool' ? step.name : toolArg(step).split('\n')[0]
  return `${DOING[k]} ${FILES.includes(k) ? arg.split('/').at(-1) : arg}`.trim()
}

// Verb, one, many.
const DONE: Record<Kind, [string, string, string]> = {
  command: ['ran', 'a command', 'commands'],
  read: ['read', 'a file', 'files'],
  edit: ['edited', 'a file', 'files'],
  write: ['wrote', 'a file', 'files'],
  search: ['ran', 'a search', 'searches'],
  fetch: ['fetched', 'a page', 'pages'],
  agent: ['ran', 'an agent', 'agents'],
  tool: ['used', 'a tool', 'tools'],
}

/** What the steps did, for the row once they're done: "Thought, ran 2 commands, read 5 files", the tools in order of
 *  first appearance. Files count once however many times they were read or edited. */
export function summary(steps: Step[]): { text: string; failed: number } {
  // Thinking leads whenever it happened: "ran 2 commands, thought, read a file" reads oddly.
  const done = new Map<Kind | 'thought', string[]>(steps.some((s) => s.type === 'reasoning') ? [['thought', []]] : [])
  let failed = 0
  for (const s of steps) {
    const k = s.type === 'reasoning' ? 'thought' : kind(s)
    if (s.type === 'tool_call') {
      done.set(k, [...(done.get(k) ?? []), toolArg(s)])
      if (s.status === 'failed') failed++
    }
  }
  const parts = [...done].map(([k, args]) => {
    if (k === 'thought') return 'thought'
    const [verb, one, many] = DONE[k]
    const n = FILES.includes(k) ? new Set(args).size : args.length
    return `${verb} ${n === 1 ? one : `${n} ${many}`}`
  })
  const text = parts.join(', ')
  return { text: text.charAt(0).toUpperCase() + text.slice(1), failed }
}
