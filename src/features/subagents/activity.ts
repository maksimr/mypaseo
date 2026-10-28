import type { TimelineItem } from '../../daemon'
import { act } from '../chat/work.ts'

/** The line under a subagent's row: its latest step ("read" "src/app.ts", `file` when `text` is a path), or the first
 *  line of its latest message, its result once it's done. */
export type Activity = { verb?: string; text: string; file?: boolean }

/** Markdown's block marks and emphasis, which a one-line preview drops. */
const plain = (line: string) => line.replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/, '').replace(/\*\*|`/g, '').trim()

/** From the agent's timeline; paths in `cwd` are shown relative to it. */
export function activity(items: TimelineItem[], cwd?: string): Activity | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.type === 'tool_call') {
      const { verb, arg, file } = act(item)
      return { verb, text: file && cwd && arg.startsWith(`${cwd}/`) ? arg.slice(cwd.length + 1) : arg, file }
    }
    if (item.type === 'assistant_message') {
      const line = item.text.split('\n').map(plain).find(Boolean)
      if (line) return { text: line }
    }
  }
}
