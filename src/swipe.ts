import { useEffect, useRef, useState, type RefObject } from 'react'

export type Side = 'left' | 'right'
/** An open side pane following the finger toward its edge, then settling open or closed (classes in styles/tablet.css). */
export type Swipe = { side: Side; settle?: 'open' | 'closed' }

const SLOP = 10 // px the finger moves before a drag is told apart from a scroll
const MIN = 60 // px of travel toward its edge that closes the pane on release
const SETTLE_MS = 200 // the settle transition in styles/tablet.css

/** Finger travel toward the side's window edge. */
const outward = (side: Side, dx: number) => (side === 'left' ? -dx : dx)
/** Whether a pane dragged dx px closes on release: dragged far enough toward its edge. */
export const closes = (side: Side, dx: number) => outward(side, dx) >= MIN

/**
 * Touch: while canClose, an open side pane follows a finger dragged toward its edge, then settles open or closed. No
 * drag in from a window edge opens one: on iOS that edge swipe is the browser's back. While it moves, root's --swipe-dx
 * holds the pane's offset from closed; onChange commits a pane that settled closed. The returned close slides an open
 * pane closed the same way, for its toggle and taps that dismiss it.
 */
export function useEdgeSwipe(
  root: RefObject<HTMLElement | null>,
  canClose: () => boolean,
  onChange: (side: Side, open: boolean) => void,
) {
  const [swipe, setSwipe] = useState<Swipe>()
  // A ref, since the listeners re-bind every render and a render can land mid-drag.
  const drag = useRef<{ side: Side; x: number; y: number; moving?: boolean }>(undefined)
  /** Moves the pane to open or closed (the transition), then commits it if that changed it. */
  const settle = (side: Side, open: boolean, changed: boolean) => {
    setSwipe({ side, settle: open ? 'open' : 'closed' })
    setTimeout(() => {
      if (changed) onChange(side, open)
      setSwipe(undefined)
    }, SETTLE_MS)
  }
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      drag.current = undefined
      // A row that swipes to show its actions ([data-swipe], sidebar/rowSwipe.ts) keeps its drags.
      if (e.touches.length !== 1 || swipe || (e.target instanceof Element && e.target.closest('[data-swipe]'))) return
      const t = e.touches[0]
      // Panes are only in the DOM (or displayed) while open, so a touch in one is in an open pane.
      const pane = canClose() && e.target instanceof Element ? e.target.closest('.sidebar, .panel') : null
      if (pane) drag.current = { side: pane.classList.contains('sidebar') ? 'left' : 'right', x: t.clientX, y: t.clientY }
    }
    const onMove = (e: TouchEvent) => {
      const d = drag.current
      if (!d) return
      const t = e.touches[0]
      const dx = t.clientX - d.x
      if (!d.moving) {
        const dy = Math.abs(t.clientY - d.y)
        if (Math.abs(dx) < SLOP && dy < SLOP) return
        if (outward(d.side, dx) <= dy) {
          drag.current = undefined // a scroll, or the wrong way
          return
        }
        d.moving = true
        setSwipe({ side: d.side })
      }
      // The open pane starts a full pane width (100%, resolved in the translate) in from closed.
      root.current?.style.setProperty('--swipe-dx', `calc(${dx}px ${d.side === 'left' ? '+' : '-'} 100%)`)
    }
    const onEnd = (e: TouchEvent) => {
      const d = drag.current
      drag.current = undefined
      if (!d?.moving) return
      const open = !closes(d.side, e.type === 'touchend' ? e.changedTouches[0].clientX - d.x : 0)
      settle(d.side, open, !open)
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
  return [swipe, (side: Side) => settle(side, false, true)] as const
}
