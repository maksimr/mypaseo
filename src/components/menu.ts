import type { MouseEvent } from 'react'

export const placeMenu = (menuId: string, above = false) => (e: MouseEvent<HTMLElement>) => {
  e.stopPropagation()
  // shortcut: fixed placement at the trigger, vertical flip only; switch to CSS anchor positioning once Baseline.
  const r = e.currentTarget.getBoundingClientRect()
  const menu = document.getElementById(menuId)!
  const place = (up: boolean) => {
    menu.style.top = up ? '' : `${r.bottom + 4}px`
    menu.style.bottom = up ? `${innerHeight - r.top + 4}px` : ''
  }
  place(above)
  menu.style.left = `${r.left}px`
  // The popover opens after this handler, so measure it before the next paint and flip up if it overflows the bottom.
  if (!above) requestAnimationFrame(() => menu.getBoundingClientRect().bottom > innerHeight && place(true))
}
