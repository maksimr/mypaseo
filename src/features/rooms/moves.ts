import { spline } from './blob.ts'

/** How a working agent's blob moves (`BusyIcon` in ProfileIcon.tsx): one move after another, picked at random, each from
 *  REST back to REST. On the 100×100 grid of `blob.ts`, around the body's center (50, 50); y points down. */

const TAU = 2 * Math.PI

/** Where the body's outline is sampled, clockwise from the right. */
export const ANGLES = Array.from({ length: 48 }, (_, i) => (TAU * i) / 48)

const MOVES = ['tidal', 'orbit', 'mitosis', 'tumble', 'jelly', 'wave'] as const
type Move = (typeof MOVES)[number]

/** Each move's length, ms. */
export const LENGTH: Record<Move, number> = { tidal: 2400, orbit: 2800, mitosis: 2600, tumble: 1800, jelly: 1400, wave: 3000 }

/** A move at random, other than `last`. */
export function nextMove(last?: Move): Move {
  const others = MOVES.filter((m) => m !== last)
  return others[Math.floor(Math.random() * others.length)]
}

/** A body's center, its scale along x and y (after its turn), and its turn, in radians. */
type Pose = { x: number; y: number; sx: number; sy: number; turn: number }

export type Frame = {
  body: Pose
  /** The eyes, on top of where the body's pose puts them: moved by dx, dy, tilted `tilt` degrees, scaled by `size`. */
  look: { dx: number; dy: number; tilt: number; size: number }
  /** How far the outline ripples in and out. */
  wobble: number
  /** A second body, and its eyes' opacity. */
  twin?: { pose: Pose; eyes: number }
  /** Droplets of the body (x, y, r): they melt into it where they meet. */
  drops: [number, number, number][]
}

const pose = (x = 50, y = 50, sx = 1, sy = sx, turn = 0): Pose => ({ x, y, sx, sy, turn })
const still = { dx: 0, dy: 0, tilt: 0, size: 1 }

export const REST: Frame = { body: pose(), look: still, wobble: 1.5, drops: [] }

/** 0 at both ends, 1 halfway, easing in and out. */
const swell = (p: number) => (1 - Math.cos(TAU * p)) / 2
/** A bell around `at`. */
const bump = (p: number, at: number, width: number) => Math.exp(-(((p - at) / width) ** 2))
const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** Where `move` is at `p`, from 0 to 1. `radii`: the outline's distance from the center at ANGLES, so that droplets
 *  leave from its edge, whatever its shape, and a hop lands on its bottom. */
export function frame(move: Move, p: number, radii: number[]): Frame {
  // The outline's distance from the center at any angle, between the samples.
  const edge = (angle: number) => {
    const f = ((((angle / TAU) % 1) + 1) % 1) * radii.length
    const i = Math.floor(f)
    const [a, b] = [radii[i % radii.length], radii[(i + 1) % radii.length]]
    return a + (b - a) * (f - i)
  }
  const e = swell(p)
  switch (move) {
    // Sloshes right, then left, stretching, a droplet trailing out of its far side.
    case 'tidal': {
      const s = Math.sin(TAU * p)
      const a = Math.abs(s)
      const far = edge(s > 0 ? Math.PI : 0) + 8
      return {
        body: pose(50 + 9 * s, 50, 1 + 0.18 * a, 1 - 0.1 * a),
        look: { ...still, dx: 3 * s, tilt: 8 * s },
        wobble: 1.5 + a,
        drops: [[50 - far * s, 52, 9]],
      }
    }
    // Shrinks a little while three droplets peel off its outline, circle it and come back.
    case 'orbit': {
      const s = 1 - 0.12 * e
      const out = Math.sin((Math.PI / 2) * Math.min(1, 3 * p, 3 - 3 * p))
      const lead = TAU * 1.1 * p - Math.PI / 2
      const drops = [0, 1, 2].map((k): [number, number, number] => {
        const a = lead + (TAU * k) / 3
        const d = out * (edge(a) * s + 6 + 7 * Math.sin(TAU * 2 * p + 2 * k))
        return [50 + d * Math.cos(a), 50 + d * Math.sin(a), 9]
      })
      return {
        body: pose(50, 50, s),
        look: { ...still, dx: 3 * e * Math.cos(lead), dy: 2 * e * Math.sin(lead) },
        wobble: 1.5 + 1.5 * e,
        drops,
      }
    }
    // Splits into two smaller copies of itself, the second's eyes opening, and merges back.
    case 'mitosis': {
      const split = e ** 1.2
      const s = 1 - 0.42 * split
      const d = 0.35 * split * (edge(0) + edge(Math.PI))
      const tilt = 5 * Math.sin(TAU * p)
      return {
        body: pose(50 - d, 50 - tilt, s, s, -0.14 * split),
        twin: { pose: pose(50 + d, 50 + tilt, s, s, 0.14 * split), eyes: clamp((split - 0.3) / 0.35) },
        look: { ...still, size: (1 - 0.25 * split) / s },
        wobble: 1.5 + split,
        drops: [],
      }
    }
    // Rolls over once, squashing a little.
    case 'tumble':
      return { body: pose(50, 50, 1 + 0.06 * e, 1 - 0.08 * e, Math.PI * (1 - Math.cos(Math.PI * p))), look: still, wobble: 1.5 + 2 * e, drops: [] }
    // Crouches, hops, lands with a squash and wobbles back, its bottom on the ground.
    case 'jelly': {
      const air = clamp((p - 0.16) / 0.56)
      const lift = 4 * air * (1 - air)
      const squash = 0.8 * bump(p, 0.1, 0.035) + bump(p, 0.76, 0.045) - 0.4 * bump(p, 0.88, 0.045)
      const [sx, sy] = [1 + 0.28 * squash - 0.1 * lift, 1 - 0.22 * squash + 0.14 * lift]
      return {
        body: pose(50, 50 + edge(Math.PI / 2) * (1 - sy) - 14 * lift, sx, sy),
        look: { ...still, dy: -2 * lift },
        wobble: 1.5,
        drops: [],
      }
    }
    // Beads out of both sides, a ripple running through the beads and it, twice.
    case 'wave': {
      const s = 1 - 0.35 * e
      const y = (i: number) => 50 + 8 * e * Math.sin(TAU * 2 * p - 0.85 * i)
      const drops = [-2, -1, 1, 2].map((k): [number, number, number] => {
        const side = edge(k < 0 ? Math.PI : 0) * s - 6
        return [50 + Math.sign(k) * e * (side + 20 * (Math.abs(k) - 1)), y(k + 2), Math.abs(k) === 1 ? 10 : 8]
      })
      return { body: pose(50, y(2), s), look: { ...still, tilt: -10 * e * Math.cos(TAU * 2 * p - 1.7) }, wobble: 1.5, drops }
    }
  }
}

/** Where `at` puts a point given from the body's center. */
function place({ x, y, sx, sy, turn }: Pose, px: number, py: number) {
  const [c, s] = [Math.cos(turn), Math.sin(turn)]
  return [x + sx * (px * c - py * s), y + sy * (px * s + py * c)]
}

/** The outline posed `at`, each radius moved by `ripple(angle)`. */
export const outlineAt = (radii: number[], at: Pose, ripple: (angle: number) => number) =>
  spline(
    radii.map((r, i) => {
      const [a, d] = [ANGLES[i], r + ripple(ANGLES[i])]
      return place(at, d * Math.cos(a), d * Math.sin(a))
    }),
  )

/** The eyes' transform: on the body's face (x, y) as `at` places it, with `look`, and `blink` (1 open, 0 shut). */
export function eyesAt(at: Pose, look: Frame['look'], [fx, fy]: number[], blink: number) {
  const [x, y] = place(at, fx - 50, fy - 50)
  const { dx, dy, tilt, size } = look
  return `translate(${x + dx} ${y + dy}) scale(${at.sx * size} ${at.sy * size}) rotate(${(at.turn * 180) / Math.PI + tilt}) scale(1 ${blink})`
}
