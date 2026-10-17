import { focusBar, focusRow } from './a11y'

/** The open tab takes the focus: its composer or terminal when shown, else its focusable view, so keys type or scroll there. */
export function focusView(app: HTMLElement | null) {
  const view = app?.querySelector('.view:not([inert])')
  const input = [...(view?.querySelectorAll<HTMLElement>('.chat-foot textarea, .term-view textarea') ?? [])].find((el) => el.checkVisibility())
  ;(input ?? view?.querySelector<HTMLElement>('[tabindex="-1"]'))?.focus()
}

/** A column's content takes the focus: the sidebar's or file panel's current row, or the main area's open tab. */
const focusContent = (app: HTMLElement, col: HTMLElement) => (col.matches('.center') ? focusView(app) : focusRow(col))

/**
 * Ctrl+Alt+arrows. Left/right: the focus moves to the content of the shown column (sidebar, main area, file panel) beside it.
 * Up/down: within the column, between its toolbars and its content. From outside the columns (a corner button, nothing),
 * the focus counts as in the main area's content.
 */
export function moveFocus(app: HTMLElement, dir: 'left' | 'right' | 'up' | 'down') {
  const active = document.activeElement
  const cols = [...app.querySelectorAll<HTMLElement>('.sidebar, .center, .panel')].filter((c) => c.checkVisibility())
  const found = cols.findIndex((c) => c.contains(active))
  const at = found < 0 ? cols.findIndex((c) => c.matches('.center')) : found
  if (dir === 'left' || dir === 'right') {
    const to = cols[at + (dir === 'right' ? 1 : -1)]
    if (to) focusContent(app, to)
    return
  }
  const col = cols[at]
  const bars = [...col.querySelectorAll<HTMLElement>('[role="toolbar"]')].filter((b) => b.checkVisibility())
  const content = col.querySelector<HTMLElement>(':scope > .tree, :scope > .panel-tabs + *, .view:not([inert])')
  // Top to bottom: the content comes after the toolbars above it or inside it (a view's own), before the rest (the sidebar's footer).
  const above = (b: HTMLElement) => !content || content.contains(b) || !!(b.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)
  const stops = [...bars.filter(above), content, ...bars.filter((b) => !above(b))]
  const bar = bars.find((b) => b.contains(active))
  const to = stops[stops.indexOf(bar ?? content) + (dir === 'down' ? 1 : -1)]
  if (to === content) focusContent(app, col)
  else if (to) focusBar(to)
}
