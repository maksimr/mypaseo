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

/** Close a modal on Escape. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
