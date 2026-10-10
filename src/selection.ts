/** Line number of a rendered line: `.code-line` in a file view, `.dl` in a diff (new side, old side for removed lines). */
const lineNo = (line: Element) => {
  const [a, b] = [...line.querySelectorAll('.ln')].map((e) => e.textContent)
  return Number(b || a)
}

/** The current text selection inside a file or diff as "path:start-end" plus its last line element, or null if there is none. */
export function selectionRef(sel: Selection | null = getSelection()): { ref: string; line: Element } | null {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  const el = (n: Node) => (n instanceof Element ? n : n.parentElement)
  const start = el(r.startContainer)?.closest('.code-line, .dl')
  let end = el(r.endContainer)?.closest('.code-line, .dl')
  // Triple-click ends the range at offset 0 of the next line: that line is not selected.
  if (end && end !== start && r.endOffset === 0 && end.previousElementSibling) end = end.previousElementSibling
  const path = start?.closest('[data-path]')?.getAttribute('data-path')
  if (!start || !end || !path || end.closest('[data-path]')?.getAttribute('data-path') !== path) return null
  const [a, b] = [lineNo(start), lineNo(end)].sort((x, y) => x - y)
  return { ref: a === b ? `${path}:${a}` : `${path}:${a}-${b}`, line: end }
}
