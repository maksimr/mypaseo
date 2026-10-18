import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fold, type RailNode } from './fold.ts'

// U: a user message, a: an agent step. Widths: a step 12+18, a run 20+18, the end circle 12.
const steps = [...'UaaUaUaaa'].map((c, i) => ({ i, minor: c === 'a' }))
const shape = (nodes: RailNode<{ i: number }>[]) => nodes.map((n) => (n.run ? `[${n.steps.map((s) => s.i)}]` : `${n.steps[0].i}`)).join(' ')

test('every step its own icon when they all fit', () => {
  assert.equal(shape(fold(steps, 282)), '0 1 2 3 4 5 6 7 8')
})

test("else the agent's steps fold, oldest first, as few as it takes", () => {
  assert.equal(shape(fold(steps, 281)), '0 [1,2] 3 4 5 6 7 8')
  assert.equal(shape(fold(steps, 259)), '0 [1,2] 3 [4] 5 [6,7] 8')
  assert.equal(shape(fold(steps, 245)), '0 [1,2] 3 [4] 5 [6,7,8]')
  assert.equal(shape(fold(steps, 216)), '0 [1,2] 3 [4] 5 [6,7,8]')
})

test('else the oldest messages fold too, keeping the latest', () => {
  assert.equal(shape(fold(steps, 215)), '[0,1,2] 3 [4] 5 [6,7,8]')
  assert.equal(shape(fold(steps, 118)), '[0,1,2,3,4] 5 [6,7,8]')
  assert.equal(shape(fold(steps, 117)), '[0,1,2,3,4,5,6,7,8]')
  assert.equal(shape(fold([], 0)), '')
})
