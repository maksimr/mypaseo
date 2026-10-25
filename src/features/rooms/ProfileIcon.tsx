import type { ReactNode } from 'react'
import { blobOf, type BlobIcon } from './blob'

/** Bodies on a 100×100 grid, and the middle of their face. Overlapping parts share one fill, so they read as one shape;
 *  a stroke in it rounds corners. */
const BODIES: Record<BlobIcon['shape'], { body: ReactNode; face: [number, number] }> = {
  circle: { body: <circle cx={50} cy={50} r={42} />, face: [50, 48] },
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
  clover: {
    body: (
      <>
        <circle cx={32} cy={33} r={21} />
        <circle cx={67} cy={31} r={21} />
        <circle cx={70} cy={66} r={21} />
        <circle cx={33} cy={68} r={21} />
        <circle cx={50} cy={50} r={24} />
      </>
    ),
    face: [51, 50],
  },
  squircle: { body: <rect x={12} y={12} width={76} height={76} rx={26} />, face: [50, 50] },
}

/** Each eye a w×h capsule turned by `eye` degrees, their centers `gap` apart, the pair turned by `pair` degrees. */
const EYES: Record<BlobIcon['eyes'], { w: number; h: number; gap: number; eye: number; pair: number }> = {
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
  const shape = BODIES[blob.shape]
  const [x, y] = shape.face
  const body = color ?? 'var(--text-muted)'
  const e = EYES[blob.eyes]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <g transform={`rotate(${blob.tilt} 50 50)`}>
        <g style={{ fill: body, stroke: body, strokeWidth: 0 }}>{shape.body}</g>
        <g style={{ fill: 'var(--bg)' }} transform={`translate(${x + blob.look.x} ${y + blob.look.y}) rotate(${e.pair})`}>
          {[-e.gap / 2, e.gap / 2].map((cx) => (
            <rect key={cx} x={cx - e.w / 2} y={-e.h / 2} width={e.w} height={e.h} rx={Math.min(e.w, e.h) / 2} transform={`rotate(${e.eye} ${cx} 0)`} />
          ))}
        </g>
      </g>
    </svg>
  )
}
