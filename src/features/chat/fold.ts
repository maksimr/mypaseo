/** A rail node: one step as its icon, or a run of them folded into dots. */
export type RailNode<S> = { run: boolean; steps: S[] }

// Widths on the rail, as chat.css lays them out: .rail-pick (20px, less its -4px margins), .rail-run, and the line to
// each node from the one before (.rail-step::before: 10px and 4px margins).
const PICK = 12
const RUN = 20
const LINE = 18

/** The rail's nodes for `steps`, oldest first, in `width` px beside the end circle. Every step its own icon if they all
 *  fit; else the user's messages (the steps not `minor`), with the agent's steps between them folded; else also the
 *  oldest messages folded into one run, as few as it takes. */
export function fold<S extends { minor: boolean }>(steps: S[], width: number): RailNode<S>[] {
  const fits = (nodes: RailNode<S>[]) => nodes.reduce((w, n) => w + (n.run ? RUN : PICK) + LINE, PICK) <= width
  const all = steps.map((s) => ({ run: false, steps: [s] }))
  if (fits(all)) return all
  const byMessage: RailNode<S>[] = []
  for (const s of steps) {
    const last = byMessage.at(-1)
    if (!s.minor) byMessage.push({ run: false, steps: [s] })
    else if (last?.run) last.steps.push(s)
    else byMessage.push({ run: true, steps: [s] })
  }
  if (fits(byMessage)) return byMessage
  for (let i = 1; i < byMessage.length; i++) {
    if (byMessage[i].run) continue // cuts only before a message
    const nodes = [{ run: true, steps: byMessage.slice(0, i).flatMap((n) => n.steps) }, ...byMessage.slice(i)]
    if (fits(nodes)) return nodes
  }
  return steps.length ? [{ run: true, steps }] : []
}
