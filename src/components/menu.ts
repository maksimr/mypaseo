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

const FOCUSABLE = 'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'

/** Tab and Shift+Tab in an open menu cycle through its controls instead of leaving it; Escape still closes it. */
export function useMenuFocusTrap() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return
      const menu = (e.target as Element).closest('.menu:popover-open')
      if (!menu) return
      const controls = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.matches(':disabled') && el.checkVisibility())
      if (!controls.length) return
      const i = controls.indexOf(e.target as HTMLElement)
      e.preventDefault()
      controls[e.shiftKey ? (i <= 0 ? controls.length - 1 : i - 1) : (i + 1) % controls.length].focus()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}

const EDGE = 8 // the least gap between a menu and the window's edge

export const placeMenu = (menuId: string, above = false) => (e: MouseEvent<HTMLElement>) => {
  e.stopPropagation()
  // shortcut: fixed placement at the trigger; switch to CSS anchor positioning once Baseline.
  const r = e.currentTarget.getBoundingClientRect()
  const menu = document.getElementById(menuId)!
  const room = (up: boolean) => (up ? r.top : innerHeight - r.bottom) - 4
  const place = (up: boolean) => {
    menu.style.top = up ? '' : `${r.bottom + 4}px`
    menu.style.bottom = up ? `${innerHeight - r.top + 4}px` : ''
  }
  place(above)
  menu.style.left = '0px' // at its full width for the measure below
  // The popover opens after this handler, so measure it before the next paint: flip it to the side with more room if
  // it overflows its own, and start it at the trigger's left edge, or end it at its right one if it would overflow the
  // window, kept inside the window either way.
  requestAnimationFrame(() => {
    if (!menu.matches(':popover-open')) return
    const { width, height } = menu.getBoundingClientRect()
    if (height > room(above) && room(!above) > room(above)) place(!above)
    const left = r.left + width > innerWidth - EDGE ? r.right - width : r.left
    menu.style.left = `${Math.max(EDGE, Math.min(left, innerWidth - width - EDGE))}px`
  })
}
