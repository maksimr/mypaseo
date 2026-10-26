import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closes } from './swipe.ts'

test('an open pane closes once dragged far enough toward its edge', () => {
  assert.equal(closes('left', -80), true)
  assert.equal(closes('left', -30), false) // short
  assert.equal(closes('left', 80), false) // inward
  assert.equal(closes('right', 80), true)
  assert.equal(closes('right', -80), false) // inward
})
