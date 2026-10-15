const LINE = '.code-line, .dl'

/** Line number of a rendered line: `.code-line` in a file view, `.dl` in a diff (new side, old side for removed lines). */
const lineNo = (line: Element) => {
  const [a, b] = [...line.querySelectorAll('.ln')].map((e) => e.textContent)
  return Number(b || a)
}

/** The rendered line before this one, skipping the comment threads between lines. */
const prevLine = (e: Element | null | undefined) => {
  let p = e?.previousElementSibling
  while (p && !p.matches(LINE)) p = p.previousElementSibling
  return p
}

export type SelectedLines = { ref: string; path: string; start: Element; line: Element }

/** The current text selection inside a file or diff as "path:start-end" plus its first and last line elements, or null if there is none. */
export function selectionRef(sel: Selection | null = getSelection()): SelectedLines | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  const el = (n: Node) => (n instanceof Element ? n : n.parentElement)
  const start = el(r.startContainer)?.closest(LINE)
  const at = el(r.endContainer)
  let end = at?.closest(LINE)
  // Triple-click ends the range at offset 0 of the next line, or of the comment thread under the line: that one is not selected.
  if (r.endOffset === 0 && end !== start) end = prevLine(end ?? at?.closest('.review-thread')) ?? end
  return start && end ? linesRef(start, end) : null
}

/** The file or diff line under the pointer at `target`, or null if there is none. */
export function hoveredRef(target: Element): SelectedLines | null {
  const line = target.closest(LINE)
  return line ? linesRef(line, line) : null
}

/** Lines `start` to `end` as "path:start-end", or null unless both are in the same file or diff. */
function linesRef(start: Element, end: Element): SelectedLines | null {
  const path = start.closest('[data-path]')?.getAttribute('data-path')
  if (!path || end.closest('[data-path]')?.getAttribute('data-path') !== path) return null
  const [a, b] = [lineNo(start), lineNo(end)].sort((x, y) => x - y)
  return { ref: a === b ? `${path}:${a}` : `${path}:${a}-${b}`, path, start, line: end }
}
