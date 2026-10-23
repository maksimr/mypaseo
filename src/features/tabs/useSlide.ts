import { useLayoutEffect, useRef, useState } from 'react'

/** The open tab's pill (`::before` in tabs.css) as keyframe lengths. */
function pill(bar: Element): Keyframe {
  const s = getComputedStyle(bar, '::before')
  return { top: s.top, left: s.left, width: s.width, height: s.height }
}

/** Slides the pill of the tab bar it's given as a ref from the old open tab to the new one. Only then: anchored to the
 *  open tab, it follows a resize at once. Not a CSS transition, which Safari skips when it starts with the move. */
export function useSlide(open: string) {
  const ref = useRef<HTMLDivElement>(null)
  const running = useRef<Animation>(undefined)
  // Where the pill was, read while the DOM still shows the old open tab (mid-slide too, so a quick second switch
  // carries on from there).
  const [slide, setSlide] = useState<{ open: string; from?: Keyframe }>({ open })
  // eslint-disable-next-line react/refs -- read before the commit on purpose; no hook runs before it
  if (slide.open !== open) setSlide({ open, from: ref.current ? pill(ref.current) : undefined })
  useLayoutEffect(() => {
    const bar = ref.current
    // A width of 0: no tab was open, so nothing to slide from.
    if (!bar || !slide.from || slide.from.width === '0px' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    running.current?.cancel() // else pill() reads where it is, not the new open tab
    running.current = bar.animate([slide.from, pill(bar)], { pseudoElement: '::before', duration: 220, easing: 'cubic-bezier(0.25, 0.9, 0.1, 1)' })
  }, [slide])
  return ref
}
