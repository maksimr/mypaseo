import { useEffect, useRef, useState, type MouseEvent } from 'react'

const SLOP = 10 // px the finger moves before a swipe is told apart from a scroll or a tap
const MIN = 40 // px of travel that flips the row open or closed on release
const SETTLE_MS = 200 // the .row.swiped transition in sidebar.css

/** The row's offset with the finger dx px from where it took the row at offset `from`: never right of closed, and past
 *  the actions' width it lags behind the finger. */
export const offset = (from: number, dx: number, width: number) => {
  const x = Math.min(0, from + dx)
  return x < -width ? -width + (x + width) / 3 : x
}
/** Whether a row let go at offset x settles open: a closed one dragged far enough left, an open one not far enough right. */
export const settlesOpen = (from: number, x: number) => (from < 0 ? x < from + MIN : x <= -MIN)

/**
 * Touch: a row dragged left follows the finger, then settles open, its actions (`.swipe-actions`, rendered while
 * `shown`) in the space it left, or closed. The next tap anywhere closes it; on the row outside its actions, that's all
 * the tap does. The row carries data-swipe, so swipe.ts doesn't take the drag to close the sidebar.
 */
export function useRowSwipe() {
  const ref = useRef<HTMLDivElement>(null)
  // Closed (no actions), following the finger, open, or sliding back (the actions stay until it's back).
  const [state, setState] = useState<'drag' | 'open' | 'closing'>()
  const at = useRef(0)
  const drag = useRef<{ x: number; y: number; from: number; moving?: boolean }>(undefined)
  const width = () => ref.current?.querySelector<HTMLElement>('.swipe-actions')?.offsetWidth ?? 0
  const move = (x: number) => {
    at.current = x
    ref.current?.style.setProperty('--swipe-dx', `${x}px`)
  }
  const settle = (open: boolean) => {
    move(open ? -width() : 0)
    setState(open ? 'open' : 'closing')
  }

  useEffect(() => {
    if (state !== 'closing') return
    const t = setTimeout(() => setState(undefined), SETTLE_MS)
    return () => clearTimeout(t)
  }, [state])
  useEffect(() => {
    if (state !== 'open') return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) settle(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [state])
  // Not React's touch props: those are passive, and a swipe must stop the list from scrolling under it.
  useEffect(() => {
    const row = ref.current!
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      drag.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, from: at.current } : undefined
    }
    const onMove = (e: TouchEvent) => {
      const d = drag.current
      if (!d) return
      const t = e.touches[0]
      const dx = t.clientX - d.x
      const dy = t.clientY - d.y
      if (!d.moving) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (Math.abs(dx) <= Math.abs(dy) || (d.from === 0 && dx > 0)) {
          drag.current = undefined // a scroll, or right on a closed row
          return
        }
        d.moving = true
        setState('drag')
      }
      e.preventDefault() // no scroll under the swipe
      move(offset(d.from, dx, width() || Infinity)) // the actions render after the first move
    }
    const onEnd = (e: TouchEvent) => {
      const d = drag.current
      drag.current = undefined
      if (!d?.moving) return
      if (e.cancelable) e.preventDefault() // no click on the row
      settle(settlesOpen(d.from, at.current))
    }
    row.addEventListener('touchstart', onStart, { passive: true })
    row.addEventListener('touchmove', onMove, { passive: false })
    row.addEventListener('touchend', onEnd)
    row.addEventListener('touchcancel', onEnd)
    return () => {
      row.removeEventListener('touchstart', onStart)
      row.removeEventListener('touchmove', onMove)
      row.removeEventListener('touchend', onEnd)
      row.removeEventListener('touchcancel', onEnd)
    }
  })

  return {
    shown: !!state,
    className: state ? `swiped${state === 'drag' ? ' swiping' : ''}` : '',
    props: {
      ref,
      'data-swipe': '',
      onClickCapture: (e: MouseEvent) => {
        if (!state) return
        if (!(e.target as Element).closest('.swipe-actions')) {
          e.preventDefault()
          e.stopPropagation()
        }
        settle(false)
      },
    },
  }
}
