import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edgeAt, opens, settlesOpen } from './swipe.ts'

test('a drag starts only at a window edge', () => {
  assert.equal(edgeAt(10, 800), 'left')
  assert.equal(edgeAt(790, 800), 'right')
  assert.equal(edgeAt(400, 800), null)
})

test('a pane opens once dragged far enough inward', () => {
  assert.equal(opens('left', 80), true)
  assert.equal(opens('left', 30), false) // short
  assert.equal(opens('right', -80), true)
  assert.equal(opens('right', 80), false) // outward
})

test('an open pane closes once dragged far enough toward its edge', () => {
  assert.equal(settlesOpen('left', true, -80), false)
  assert.equal(settlesOpen('left', true, -30), true) // short
  assert.equal(settlesOpen('left', true, 80), true) // inward
  assert.equal(settlesOpen('right', true, 80), false)
  assert.equal(settlesOpen('right', false, -80), true) // opening
})
