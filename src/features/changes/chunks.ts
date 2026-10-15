import type { DiffFile } from '../../daemon'

type Hunk = DiffFile['hunks'][number]
type Row = Hunk['lines'][number] & { o: number | ''; n: number | '' }
/** A run of context rows, or a run of changed rows (a Zed "diff hunk"). `from`/`at`: 0-based index of the run in the old/new file. */
export type Chunk = { change: boolean; from: number; at: number; rows: Row[] }

export function chunks(h: Hunk): Chunk[] {
  let o = h.oldStart
  let n = h.newStart
  const out: Chunk[] = []
  for (const l of h.lines) {
    if (l.type === 'header') continue
    const change = l.type !== 'context'
    // An empty side (`-N,0` / `+N,0`) names the line before the change, not the first changed line.
    const from = h.oldCount ? o - 1 : o
    const at = h.newCount ? n - 1 : n
    const row = { ...l, o: l.type === 'add' ? ('' as const) : o++, n: l.type === 'remove' ? ('' as const) : n++ }
    const last = out.at(-1)
    if (last?.change === change) last.rows.push(row)
    else out.push({ change, from, at, rows: [row] })
  }
  return out
}

/** Hunks of one file's unified diff text. */
export function parseHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = []
  const types = { ' ': 'context', '-': 'remove', '+': 'add' } as const
  for (const line of diff.split('\n')) {
    const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (m) hunks.push({ oldStart: +m[1], oldCount: +(m[2] ?? 1), newStart: +m[3], newCount: +(m[4] ?? 1), lines: [] })
    else if (hunks.length && line[0] in types) hunks.at(-1)!.lines.push({ type: types[line[0] as ' '], content: line.slice(1) })
  }
  return hunks
}

/** Same key for the same change in HEAD→worktree and HEAD→index diffs: both share the old side. */
export const chunkKey = (c: Chunk) => JSON.stringify([c.from, c.rows.map((r) => r.type[0] + r.content)])

/** Keys of the staged chunks per path, from the `-U0` HEAD→index diff of each staged file. */
export const stagedKeys = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([path, diff]) => [path, new Set(parseHunks(diff).flatMap(chunks).map(chunkKey))]))

/** How much of a file is staged; `keys` is undefined when nothing is. Staged changes that match no chunk count as 'some'. */
export function stagedState(hunks: Hunk[], keys: Set<string> | undefined): 'none' | 'some' | 'all' {
  if (!keys) return 'none'
  const cs = hunks.flatMap(chunks).filter((c) => c.change)
  return cs.every((c) => keys.has(chunkKey(c))) ? 'all' : 'some'
}

/** A patch for `git apply --cached` of change chunk `cs[i]`, with the context rows around it as anchors. */
export function chunkPatch(path: string, cs: Chunk[], i: number): string {
  const rows = [cs[i - 1], cs[i], cs[i + 1]].flatMap((c) => c?.rows ?? [])
  const olds = rows.filter((r) => r.type !== 'add')
  const news = rows.filter((r) => r.type !== 'remove')
  const head = `@@ -${olds[0]?.o ?? cs[i].from},${olds.length} +${news[0]?.n ?? cs[i].at},${news.length} @@`
  const body = rows.map((r) => (r.type === 'add' ? '+' : r.type === 'remove' ? '-' : ' ') + r.content)
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, head, ...body, ''].join('\n')
}

/** Puts a changed chunk's old lines back into `text`, the current file. Throws if the file no longer matches the diff. */
export function restoreChunk(text: string, c: Chunk): string {
  const lines = text.split('\n')
  const pick = (type: string) => c.rows.filter((r) => r.type === type).map((r) => r.content)
  const added = pick('add')
  if (added.some((l, i) => lines[c.at + i] !== l)) throw new Error('The file changed since the diff was loaded.')
  lines.splice(c.at, added.length, ...pick('remove'))
  return lines.join('\n')
}
