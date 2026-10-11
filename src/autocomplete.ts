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
