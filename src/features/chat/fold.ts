/** A rail node: one step as its icon, or a run of them folded into dots. */
export type RailNode<S> = { run: boolean; steps: S[] }

// Widths on the rail, as chat.css lays them out: .rail-pick (20px, less its -4px margins), .rail-run, and the line to
// each node from the one before (.rail-step::before: 10px and 4px margins).
const PICK = 12
const RUN = 20
const LINE = 18

/** The rail's nodes for `steps`, oldest first, in `width` px beside the end circle. Every step its own icon if they all
 *  fit. Else the agent's steps (the `minor` ones) fold first, oldest first, into runs between the user's messages, as
 *  few as it takes; then the oldest messages too, with everything before them, into one run. */
export function fold<S extends { minor: boolean }>(steps: S[], width: number): RailNode<S>[] {
  // Folding an agent step joins the run before it, or starts one: the first k, the fewest that fit.
  let w = PICK + steps.length * (PICK + LINE)
  let k = 0
  for (let j = 0; w > width && j < steps.length; j++) {
    if (!steps[j].minor) continue
    w += steps[j - 1]?.minor ? -(PICK + LINE) : RUN - PICK
    k++
  }
  if (w <= width) return group(steps, k)
  // Every agent step folded: a run of everything before a message, the latest that fits.
  const byMessage = group(steps, Infinity)
  let cut = -1
  w = PICK + RUN + LINE
  for (let i = byMessage.length - 1; i > 0; i--) {
    w += (byMessage[i].run ? RUN : PICK) + LINE
    if (w > width) break
    if (!byMessage[i].run) cut = i
  }
  if (cut < 0) return steps.length ? [{ run: true, steps }] : []
  return [{ run: true, steps: byMessage.slice(0, cut).flatMap((n) => n.steps) }, ...byMessage.slice(cut)]
}

/** `steps` with the first `k` agent steps folded. */
function group<S extends { minor: boolean }>(steps: S[], k: number): RailNode<S>[] {
  const nodes: RailNode<S>[] = []
  let folded = 0
  for (const s of steps) {
    const last = nodes.at(-1)
    if (!s.minor || folded++ >= k) nodes.push({ run: false, steps: [s] })
    else if (last?.run) last.steps.push(s)
    else nodes.push({ run: true, steps: [s] })
  }
  return nodes
}
