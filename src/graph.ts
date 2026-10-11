/** A line of the graph from this row's center down to the next row's, in lane units; `lane` picks its color. */
export type GraphLine = { from: number; to: number; lane: number }
export type GraphRow = { lane: number; lines: GraphLine[] }

/**
 * Assigns each commit a lane and the lines down to the next row. Commits must come children first (git log
 * --date-order or --topo-order). A lane holds the sha it expects next; a commit takes the first lane expecting it.
 */
export function layout(commits: { sha: string; parents: string[] }[]) {
  const lanes: (string | null)[] = []
  const slot = () => (lanes.includes(null) ? lanes.indexOf(null) : lanes.length)
  let width = 0
  const rows = commits.map((c, i): GraphRow => {
    let lane = lanes.indexOf(c.sha)
    if (lane < 0) lane = slot() // a branch tip
    // Other lanes waiting for this commit join it here.
    lanes.forEach((s, j) => s === c.sha && (lanes[j] = null))
    lanes[lane] = c.parents[0] ?? null
    const from = new Map([[lane, lane]]) // lanes this commit starts, to the column they start from
    const joins: number[] = [] // existing lanes a merge parent joins
    for (const p of c.parents.slice(1)) {
      const k = lanes.indexOf(p)
      if (k >= 0) joins.push(k)
      else {
        const n = slot()
        lanes[n] = p
        from.set(n, lane)
      }
    }
    width = Math.max(width, lanes.length)
    const next = commits[i + 1]?.sha
    const nextLane = next ? lanes.indexOf(next) : -1
    const to = (k: number) => (nextLane >= 0 && lanes[k] === next ? nextLane : k)
    const lines: GraphLine[] = []
    lanes.forEach((s, k) => s !== null && lines.push({ from: from.get(k) ?? k, to: to(k), lane: k }))
    for (const k of joins) lines.push({ from: lane, to: to(k), lane: k })
    while (lanes.length && lanes.at(-1) === null) lanes.pop()
    return { lane, lines }
  })
  return { rows, width }
}
