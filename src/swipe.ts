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

/**
 * Touch: a closed side pane follows a finger dragged in from its window edge, then settles open or closed. While it
 * moves, root's --swipe-dx holds the finger's travel; onOpen commits a pane that settled open.
 */
export function useEdgeSwipe(root: RefObject<HTMLElement | null>, canOpen: (side: Side) => boolean, onOpen: (side: Side) => void) {
  const [swipe, setSwipe] = useState<Swipe>()
  // A ref, since the listeners re-bind every render and a render can land mid-drag.
  const drag = useRef<{ side: Side; x: number; y: number; moving?: boolean }>(undefined)
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const side = e.touches.length === 1 && !swipe ? edgeAt(t.clientX, window.innerWidth) : null
      drag.current = side && canOpen(side) ? { side, x: t.clientX, y: t.clientY } : undefined
    }
    const onMove = (e: TouchEvent) => {
      const d = drag.current
      if (!d) return
      const t = e.touches[0]
      const dx = t.clientX - d.x
      if (!d.moving) {
        const dy = Math.abs(t.clientY - d.y)
        if (Math.abs(dx) < SLOP && dy < SLOP) return
        if (inward(d.side, dx) <= dy) {
          drag.current = undefined // a scroll, or outward
          return
        }
        d.moving = true
        setSwipe({ side: d.side })
      }
      root.current?.style.setProperty('--swipe-dx', `${dx}px`)
    }
    const onEnd = (e: TouchEvent) => {
      const d = drag.current
      drag.current = undefined
      if (!d?.moving) return
      const open = e.type === 'touchend' && opens(d.side, e.changedTouches[0].clientX - d.x)
      setSwipe({ side: d.side, settle: open ? 'open' : 'closed' })
      setTimeout(() => {
        if (open) onOpen(d.side)
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
