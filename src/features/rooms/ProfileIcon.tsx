import { useId, useLayoutEffect, useReducer, useRef, type ReactNode } from 'react'
import { BLOB, blobOf, outline, type BlobIcon, type Eyes, type Shape } from './blob'
import { ANGLES, eyesAt, frame, LENGTH, nextMove, outlineAt, REST, type Frame } from './moves'

type Body = { body: ReactNode; face: [number, number] }

/** Bodies on a 100×100 grid, and the middle of their face. Overlapping parts share one fill, so they read as one shape;
 *  a stroke in it rounds corners. */
const BODIES: Record<Shape, Body> = {
  circle: { body: <circle cx={50} cy={50} r={42} />, face: [50, 48] },
  blob: { body: <path d={outline(BLOB)} />, face: [50, 48] },
  hexagon: { body: <path d="M50 13L82 31.5V68.5L50 87L18 68.5V31.5Z" strokeWidth={12} strokeLinejoin="round" />, face: [50, 50] },
  drop: { body: <path d="M50 6C58 6 86 34 86 60A36 36 0 0 1 14 60C14 34 42 6 50 6Z" />, face: [50, 62] },
  triangle: { body: <path d="M50 18L85 79H15Z" strokeWidth={18} strokeLinejoin="round" />, face: [50, 62] },
  cloud: {
    body: (
      <>
        <circle cx={30} cy={46} r={20} />
        <circle cx={56} cy={36} r={22} />
        <circle cx={76} cy={54} r={17} />
        <circle cx={64} cy={68} r={18} />
        <circle cx={36} cy={68} r={19} />
        <circle cx={22} cy={60} r={15} />
        <circle cx={50} cy={54} r={24} />
      </>
    ),
    face: [50, 54],
  },
  pill: { body: <rect x={8} y={20} width={84} height={60} rx={30} />, face: [50, 50] },
  squircle: { body: <rect x={12} y={12} width={76} height={76} rx={26} />, face: [50, 50] },
}

/** Each eye a w×h capsule turned by `eye` degrees, their centers `gap` apart, the pair turned by `pair` degrees. */
const EYES: Record<Eyes, { w: number; h: number; gap: number; eye: number; pair: number }> = {
  tall: { w: 10, h: 22, gap: 24, eye: 0, pair: 0 },
  short: { w: 8, h: 14, gap: 20, eye: 0, pair: 0 },
  dash: { w: 17, h: 7, gap: 21, eye: 0, pair: 18 },
  glint: { w: 7, h: 17, gap: 19, eye: 28, pair: -22 },
}

/** A profile's generated icon, drawn in its color (a CSS color), `size` px square, else as CSS sizes it; `fallback`, by
 *  default a dot in its color, when its icon isn't one (`blob.ts`). */
export function ProfileIcon({
  icon,
  color,
  size,
  fallback = <span className="dot" style={{ background: color }} />,
}: {
  icon?: string
  color?: string
  size?: number
  fallback?: ReactNode
}) {
  const blob = blobOf(icon)
  if (!blob) return fallback
  const shape = shapeOf(blob)
  const [x, y] = shape.face
  const body = color ?? 'var(--text-muted)'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <g style={{ fill: body, stroke: body, strokeWidth: 0 }}>{shape.body}</g>
      <g style={{ fill: 'var(--bg)' }} transform={`translate(${x} ${y})`}>
        <EyePair eyes={blob.eyes} />
      </g>
    </svg>
  )
}

const shapeOf = (blob: BlobIcon): Body => (typeof blob.body === 'string' ? BODIES[blob.body] : { body: <path d={outline(blob.body)} />, face: [50, 48] })

/** Both eyes, around (0, 0). */
function EyePair({ eyes }: { eyes: Eyes }) {
  const e = EYES[eyes]
  return (
    <g transform={`rotate(${e.pair})`}>
      {[-e.gap / 2, e.gap / 2].map((cx) => (
        <rect key={cx} x={cx - e.w / 2} y={-e.h / 2} width={e.w} height={e.h} rx={Math.min(e.w, e.h) / 2} transform={`rotate(${e.eye} ${cx} 0)`} />
      ))}
    </g>
  )
}

/** The outlines BusyIcon has read, by body. */
const outlines = new Map<string, number[]>()

/** A body's outline: its distance from (50, 50) at each of ANGLES, read off its drawn parts (in their fill, or in the
 *  stroke that rounds their corners). Undefined while they aren't laid out. */
function measure(parts: SVGGeometryElement[]) {
  const inside = (x: number, y: number) => parts.some((p) => p.isPointInFill({ x, y }) || p.isPointInStroke({ x, y }))
  const radii = ANGLES.map((a) => {
    let [lo, hi] = [0, 64]
    for (let i = 0; i < 10; i++) {
      const r = (lo + hi) / 2
      if (inside(50 + r * Math.cos(a), 50 + r * Math.sin(a))) lo = r
      else hi = r
    }
    return lo
  })
  return radii.every((r) => r > 0) ? radii : undefined
}

/** Between two moves, ms. */
const PAUSE = 400

/** A working agent's blob making one move after another (`moves.ts`): drawn as ProfileIcon draws it until its outline is
 *  read off that, then that outline rippling and posed each frame, droplets and a twin melting into it through a goo
 *  filter. Still under reduced motion. */
export function BusyIcon({ blob, color, size }: { blob: BlobIcon; color?: string; size?: number }) {
  const key = typeof blob.body === 'string' ? blob.body : blob.body.join(',')
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const radii = calm ? undefined : outlines.get(key)
  const [, measured] = useReducer((n: number) => n + 1, 0)
  const parts = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const twinEyes = useRef<SVGGElement>(null)
  const goo = useId()
  const shape = shapeOf(blob)
  const [fx, fy] = shape.face
  useLayoutEffect(() => {
    if (calm) return
    let timer = 0
    if (!radii) {
      const read = () => {
        const r = measure([...parts.current!.children] as SVGGeometryElement[])
        if (!r) timer = setTimeout(read, 500)
        else {
          outlines.set(key, r)
          measured()
        }
      }
      read()
      return () => clearTimeout(timer)
    }
    const [main, twin, ...drops] = parts.current!.children
    const blinkAt = Math.random() * 6.1 // s: agents working side by side don't blink together
    let [move, began, t, last, raf] = [nextMove(), 0, 0, 0, 0]
    const draw = (f: Frame) => {
      const s = t / 1000
      const ripple = (a: number) => f.wobble * Math.sin(3 * a + 2.2 * s)
      main.setAttribute('d', outlineAt(radii, f.body, ripple))
      twin.setAttribute('d', f.twin ? outlineAt(radii, f.twin.pose, ripple) : 'M0 0')
      drops.forEach((c, i) => {
        const [cx, cy, r] = f.drops[i] ?? [50, 50, 0]
        c.setAttribute('cx', String(cx))
        c.setAttribute('cy', String(cy))
        c.setAttribute('r', String(r))
      })
      const blink = 1 - 0.93 * Math.exp(-(((((s + blinkAt) % 6.1) - 5.3) / 0.09) ** 2))
      eyes.current!.setAttribute('transform', eyesAt(f.body, f.look, [fx, fy], blink))
      twinEyes.current!.setAttribute('opacity', String(f.twin?.eyes ?? 0))
      if (f.twin) twinEyes.current!.setAttribute('transform', eyesAt(f.twin.pose, f.look, [fx, fy], blink))
    }
    const tick = (now: number) => {
      // At most 50ms a frame: back on a tab after a while, it carries on where it was.
      t += last && Math.min(now - last, 50)
      last = now
      if (t - began > LENGTH[move] + PAUSE) [move, began] = [nextMove(move), t]
      const p = (t - began) / LENGTH[move]
      draw(p < 1 ? frame(move, p, radii) : REST)
      raf = requestAnimationFrame(tick)
    }
    tick(0)
    return () => cancelAnimationFrame(raf)
  }, [calm, key, radii, fx, fy])
  const body = color ?? 'var(--text-muted)'
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} overflow="visible" aria-hidden>
      <filter id={goo} colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation={3.5} />
        <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8.5" />
      </filter>
      <g ref={parts} filter={radii && `url(#${goo})`} style={{ fill: body, stroke: body, strokeWidth: 0 }}>
        {radii ? (
          <>
            <path />
            <path />
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} />
            ))}
          </>
        ) : (
          shape.body
        )}
      </g>
      <g style={{ fill: 'var(--bg)' }}>
        <g ref={eyes} transform={`translate(${fx} ${fy})`}>
          <EyePair eyes={blob.eyes} />
        </g>
        <g ref={twinEyes} opacity={0}>
          <EyePair eyes={blob.eyes} />
        </g>
      </g>
    </svg>
  )
}
