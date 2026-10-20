import { useEffect, type MouseEvent } from 'react'

const PHONE = '(width < 600px)' // the phone media query in tablet.css that gives .menu::backdrop its scrim

// The UA sheet makes a popover's ::backdrop pointer-events: none, so on phones the tap on the scrim that closes a menu
// would also click the row under it. Swallow that click (it may land on the menu's own button: close the menu then).
export function useMenuScrim() {
  useEffect(() => {
    let dismissing = false
    const down = (e: Event) => {
      dismissing =
        matchMedia(PHONE).matches && !!document.querySelector('.menu:popover-open') && !(e.target as Element).closest('.menu')
    }
    const click = (e: Event) => {
      if (!dismissing) return
      dismissing = false
      e.preventDefault()
      e.stopPropagation()
      document.querySelectorAll<HTMLElement>('.menu:popover-open').forEach((m) => m.hidePopover())
    }
    addEventListener('pointerdown', down, true)
    addEventListener('click', click, true)
    return () => {
      removeEventListener('pointerdown', down, true)
      removeEventListener('click', click, true)
    }
  }, [])
}

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
