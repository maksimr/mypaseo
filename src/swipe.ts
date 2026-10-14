import { useEffect, useRef, useState, type RefObject } from 'react'

export type Side = 'left' | 'right'
/** A side pane following the finger in, then settling open or closed (classes in index.css). */
export type Swipe = { side: Side; settle?: 'open' | 'closed' }

const EDGE = 30 // px from the window edge where a drag has to start
const SLOP = 10 // px the finger moves before a drag is told apart from a scroll
const MIN = 60 // px of inward travel that opens the pane on release
const SETTLE_MS = 200 // the settle transition in index.css

/** The window edge a touch at x starts on, if any. */
export const edgeAt = (x: number, width: number): Side | null => (x < EDGE ? 'left' : x > width - EDGE ? 'right' : null)
/** Finger travel toward the window's center from the side's edge. */
const inward = (side: Side, dx: number) => (side === 'left' ? dx : -dx)
/** Whether a pane dragged dx px from its edge opens on release. */
export const opens = (side: Side, dx: number) => inward(side, dx) >= MIN
/** Whether a pane settles open after a drag of dx px: an opening one if dragged far enough in, a closing one unless dragged far enough out. */
export const settlesOpen = (side: Side, closing: boolean, dx: number) => (closing ? !opens(side, -dx) : opens(side, dx))

/**
 * Touch: a closed side pane follows a finger dragged in from its window edge, and, while canClose, an open one follows
 * a finger dragged toward its edge; either then settles open or closed. While it moves, root's --swipe-dx holds the
 * pane's offset from closed; onChange commits a pane that settled the other way.
 */
export function useEdgeSwipe(
  root: RefObject<HTMLElement | null>,
  canOpen: (side: Side) => boolean,
  canClose: () => boolean,
  onChange: (side: Side, open: boolean) => void,
) {
  const [swipe, setSwipe] = useState<Swipe>()
  // A ref, since the listeners re-bind every render and a render can land mid-drag.
  const drag = useRef<{ side: Side; closing: boolean; x: number; y: number; moving?: boolean }>(undefined)
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      drag.current = undefined
      if (e.touches.length !== 1 || swipe) return
      const t = e.touches[0]
      const at = { x: t.clientX, y: t.clientY }
      // Panes are only in the DOM (or displayed) while open, so a touch in one is in an open pane.
      const pane = canClose() && e.target instanceof Element ? e.target.closest('.sidebar, .panel') : null
      const side = edgeAt(t.clientX, window.innerWidth)
      if (pane) drag.current = { side: pane.classList.contains('sidebar') ? 'left' : 'right', closing: true, ...at }
      else if (side && canOpen(side)) drag.current = { side, closing: false, ...at }
    }
    const onMove = (e: TouchEvent) => {
      const d = drag.current
      if (!d) return
      const t = e.touches[0]
      const dx = t.clientX - d.x
      if (!d.moving) {
        const dy = Math.abs(t.clientY - d.y)
        if (Math.abs(dx) < SLOP && dy < SLOP) return
        if (inward(d.side, d.closing ? -dx : dx) <= dy) {
          drag.current = undefined // a scroll, or the wrong way
          return
        }
        d.moving = true
        setSwipe({ side: d.side })
      }
      // A closing pane starts a full pane width (100%, resolved in the translate) further in.
      root.current?.style.setProperty('--swipe-dx', d.closing ? `calc(${dx}px ${d.side === 'left' ? '+' : '-'} 100%)` : `${dx}px`)
    }
    const onEnd = (e: TouchEvent) => {
      const d = drag.current
      drag.current = undefined
      if (!d?.moving) return
      const open = settlesOpen(d.side, d.closing, e.type === 'touchend' ? e.changedTouches[0].clientX - d.x : 0)
      setSwipe({ side: d.side, settle: open ? 'open' : 'closed' })
      setTimeout(() => {
        if (open !== d.closing) onChange(d.side, open) // a closing pane started open
        setSwipe(undefined)
      }, SETTLE_MS)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  })
  return swipe
}
