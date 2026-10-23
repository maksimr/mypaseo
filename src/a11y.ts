import { useEffect, type KeyboardEvent } from 'react'

/** Keyboard-accessible props for clickable rows that can't be <button>s (they contain buttons). */
export const clickable = (onActivate: () => void) => ({
  role: 'button',
  tabIndex: 0,
  onClick: onActivate,
  onKeyDown: (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault()
      onActivate()
    }
  },
})

/** Focuses a side pane's current row (`.row.active`, or a collapsed project holding the selection), else its first row, else the pane. */
export function focusRow(pane: HTMLElement | null | undefined) {
  ;(pane?.querySelector<HTMLElement>('.row[tabindex]:is(.active, [aria-current])') ?? pane?.querySelector<HTMLElement>('.row[tabindex]') ?? pane)?.focus()
}

/** Vim's h/j/k/l by physical key (code), as in keymap.ts, so they work on a Cyrillic layout too. */
const VIM: Record<string, string> = { KeyH: 'ArrowLeft', KeyJ: 'ArrowDown', KeyK: 'ArrowUp', KeyL: 'ArrowRight' }
/** The arrow key pressed, or the one h/j/k/l stand for outside a text field, where they type. */
const arrow = (e: KeyboardEvent, t: HTMLElement) =>
  e.key.startsWith('Arrow') ? e.key : t.matches('input, textarea, select') || t.isContentEditable ? undefined : VIM[e.code]

/**
 * A side pane's onKeyDown, like a tree: ↑/↓ (or k/j) move the focus to the row above or below (from the pane itself, to its
 * first or last row); →/← (or l/h) expand/collapse the row, through whichever of it or its chevron carries aria-expanded.
 * `rowClass` picks the rows, for a list whose rows aren't `.row`s (the git graph's).
 */
export function navigateRows(e: KeyboardEvent<HTMLElement>, rowClass = '.row') {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !(e.target instanceof HTMLElement)) return
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(`${rowClass}[tabindex]`)]
  const row = e.target.closest<HTMLElement>(rowClass) // the focus is on a row or a button in it
  const i = row ? rows.indexOf(row) : -1
  const key = arrow(e, e.target)
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const step = key === 'ArrowDown' ? 1 : -1
    const next = e.target === e.currentTarget ? rows.at(step > 0 ? 0 : -1) : i >= 0 ? rows[i + step] : undefined
    if (!next) return
    e.preventDefault() // no scroll on top of the focus move
    next.focus()
  } else if ((key === 'ArrowRight' || key === 'ArrowLeft') && i >= 0) {
    const toggle = rows[i].matches('[aria-expanded]') ? rows[i] : rows[i].querySelector<HTMLElement>('[aria-expanded]')
    if (!toggle) return
    e.preventDefault()
    if ((toggle.getAttribute('aria-expanded') === 'true') !== (key === 'ArrowRight')) toggle.click()
  }
}

const CONTROL = ':is(button, input, select, a[href], [tabindex="0"]):not(:disabled)'
/** A toolbar's arrow-key stops: its shown controls, minus those inside another (a tab's close button) or in a menu. */
const barControls = (bar: Element) =>
  [...bar.querySelectorAll<HTMLElement>(CONTROL)].filter(
    (el) => !el.parentElement?.closest(`${CONTROL}, .menu`) && el.checkVisibility() && getComputedStyle(el).visibility === 'visible',
  )

/** Focuses a toolbar's open tab, else its first control. */
export function focusBar(bar: Element) {
  const controls = barControls(bar)
  ;(controls.find((el) => el.matches('.tab.on, .panel-tab.on')) ?? controls[0])?.focus()
}

/** The app's onKeyDown: ←/→ (or h/l) in a `role="toolbar"` move the focus to the previous or next control; in a text field, the caret. */
export function navigateBars(e: KeyboardEvent<HTMLElement>) {
  const t = e.target instanceof HTMLElement ? e.target : null
  const key = t && arrow(e, t)
  const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const bar = t && !t.matches('input, textarea') && !t.closest('.menu') ? t.closest('[role="toolbar"]') : null
  if (!step || !t || !bar || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const controls = barControls(bar)
  const i = controls.findIndex((el) => el.contains(t))
  const next = i < 0 ? undefined : controls[i + step]
  if (!next) return
  e.preventDefault() // a select would change its value
  next.focus()
}

/** Close a modal on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
