import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ANGLES, frame, LENGTH, REST } from './moves.ts'

const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} ≠ ${b}`)

test('every move starts and ends at rest, its droplets inside the body, so one leads into the next', () => {
  const circle = ANGLES.map(() => 42)
  const pill = ANGLES.map((a) => Math.min(42 / Math.abs(Math.cos(a)), 30 / Math.abs(Math.sin(a))))
  for (const move of Object.keys(LENGTH) as (keyof typeof LENGTH)[])
    for (const radii of [circle, pill])
      for (const p of [0, 1]) {
        const at = `${move} at ${p}`
        const f = frame(move, p, radii)
        for (const pose of [f.body, f.twin?.pose ?? f.body]) {
          for (const k of ['x', 'y', 'sx', 'sy'] as const) near(pose[k], REST.body[k], `${at}, ${k}`)
          near(Math.sin(pose.turn), 0, `${at}, turn`)
          near(Math.cos(pose.turn), 1, `${at}, turn`)
        }
        for (const k of ['dx', 'dy', 'tilt', 'size'] as const) near(f.look[k], REST.look[k], `${at}, ${k}`)
        near(f.wobble, REST.wobble, `${at}, wobble`)
        near(f.twin?.eyes ?? 0, 0, `${at}, twin's eyes`)
        for (const [x, y, r] of f.drops) assert.ok(Math.hypot(x - 50, y - 50) + r < 30, `${at}: a droplet shows`)
      }
})
