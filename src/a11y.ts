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

/**
 * A side pane's onKeyDown, like a tree: ↑/↓ move the focus to the row above or below (from the pane itself, to its first or
 * last row); →/← expand/collapse the row, through whichever of it or its chevron carries aria-expanded.
 */
export function navigateRows(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !(e.target instanceof HTMLElement)) return
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.row[tabindex]')]
  const row = e.target.closest<HTMLElement>('.row') // the focus is on a row or a button in it
  const i = row ? rows.indexOf(row) : -1
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const step = e.key === 'ArrowDown' ? 1 : -1
    const next = e.target === e.currentTarget ? rows.at(step > 0 ? 0 : -1) : i >= 0 ? rows[i + step] : undefined
    if (!next) return
    e.preventDefault() // no scroll on top of the focus move
    next.focus()
  } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && i >= 0) {
    const toggle = rows[i].matches('[aria-expanded]') ? rows[i] : rows[i].querySelector<HTMLElement>('[aria-expanded]')
    if (!toggle) return
    e.preventDefault()
    if ((toggle.getAttribute('aria-expanded') === 'true') !== (e.key === 'ArrowRight')) toggle.click()
  }
}

/** Close a modal on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
