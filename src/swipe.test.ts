import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edgeAt, opens } from './swipe.ts'

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
