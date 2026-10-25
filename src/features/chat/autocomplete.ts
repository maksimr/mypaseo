import { compareMatchScores, scorePathMatch } from '@getpaseo/protocol/search/text-match'

/** A `/command` or `@file` token that ends at the cursor; `start..end` is the range a pick replaces. */
export type Trigger = { kind: '/' | '@'; start: number; end: number; query: string }

// Same rules as the desktop app: `@` matches anywhere, `/` only at the start or after whitespace; quotes and whitespace end both.
export function activeTrigger(text: string, cursor: number): Trigger | null {
  const before = text.slice(0, cursor)
  const at = /@([^\s"'@]*)$/.exec(before)
  if (at) return { kind: '@', start: at.index, end: cursor, query: at[1] }
  const slash = /(^|\s)\/([^/\s"']*)$/.exec(before)
  if (slash) return { kind: '/', start: slash.index + slash[1].length, end: cursor, query: slash[2] }
  return null
}

/** Text that replaces the trigger: `/name ` (space only at the end of the text) or the quoted path, like the desktop app. */
export const completion = (t: Trigger, value: string, text: string) =>
  t.kind === '/' ? `/${value}${t.end === text.length ? ' ' : ''}` : `"${value.replace(/"/g, '\\"')}"`

/** Commands whose name contains the query, ranked like the desktop app: exact, prefix, word start, substring; then match position and name. */
export function rankCommands<T extends { name: string }>(commands: T[], query: string): T[] {
  const q = query.toLowerCase()
  if (!q) return commands
  const tier = (name: string, i: number) =>
    name === q ? 0 : i === 0 ? 1 : name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q)) ? 2 : 3
  return commands
    .map((c) => {
      const name = c.name.toLowerCase()
      const i = name.indexOf(q)
      return { c, i, tier: tier(name, i) }
    })
    .filter((m) => m.i >= 0)
    .sort((a, b) => a.tier - b.tier || a.i - b.i || a.c.name.localeCompare(b.c.name))
    .map((m) => m.c)
}

// The daemon's file search never enters these either; they hold most of a workspace's files.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'venv', 'env', 'virtualenv', 'dist', 'build', 'target', 'out', 'coverage', 'vendor', '__pycache__'])

type Entry = { name: string; path: string; kind: string }

/**
 * Every file of the workspace, hidden and gitignored ones included, which the daemon's file search leaves out.
 * Lists one directory per `list` call, a level at a time; unreadable subdirectories are skipped.
 * shortcut: stops after the level that reaches `limit` files, so a huge workspace lists partly; move to a daemon plugin RPC if that bites.
 */
export async function listAllFiles(list: (dir: string) => Promise<Entry[]>, limit = 20000): Promise<string[]> {
  const files: string[] = []
  let dirs = ['.']
  while (dirs.length && files.length < limit) {
    const entries = (await Promise.all(dirs.map((d) => (d === '.' ? list(d) : list(d).catch(() => []))))).flat()
    files.push(...entries.filter((e) => e.kind === 'file').map((e) => e.path))
    dirs = entries.filter((e) => e.kind === 'directory' && !SKIP_DIRS.has(e.name)).map((e) => e.path)
  }
  return files
}

/** The best `limit` paths for the query, scored like the daemon's file search; shorter paths win ties. */
export const rankPaths = (paths: string[], query: string, limit: number) =>
  paths
    .flatMap((path) => {
      const score = scorePathMatch(query, path)
      return score ? [{ path, score }] : []
    })
    .sort((a, b) => compareMatchScores(a.score, b.score) || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((m) => m.path)

/** The `@word` the caret is in or right after, lowercased, without the `@`. */
export function mentionAt(text: string, caret: number) {
  const head = /@([a-z0-9-]*)$/i.exec(text.slice(0, caret))
  return head ? (head[1] + /^[a-z0-9-]*/i.exec(text.slice(caret))![0]).toLowerCase() : undefined
}

// Each mention of handle (rooms/mentions.ts rules).
// shortcut: also inside code, where mentions don't count; skip code spans if someone mentions a handle in code.
const mentionsOf = (handle: string) => new RegExp(`(?<![\\p{L}\\p{N}_./@-])@(${handle})(?![a-z0-9-])`, 'giu')

/** Drops the `@` of each mention of handle, so the word stays and mentions no one. */
export const unmention = (text: string, handle: string) => text.replace(mentionsOf(handle), '$1')

/** Turns each mention of handle into one of `to`. */
export const remention = (text: string, handle: string, to: string) => text.replace(mentionsOf(handle), `@${to}`)
