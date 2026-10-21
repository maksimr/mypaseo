import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offset, settlesOpen } from './rowSwipe.ts'

test('a row follows the finger left, stops at closed, and lags past its actions', () => {
  assert.equal(offset(0, -50, 140), -50)
  assert.equal(offset(0, 30, 140), 0) // right of closed
  assert.equal(offset(-140, 50, 140), -90) // an open row dragged back
  assert.equal(offset(0, -170, 140), -150) // 30px past: a third
})

test('a row settles open once dragged far enough left, closed once dragged far enough back', () => {
  assert.equal(settlesOpen(0, -50), true)
  assert.equal(settlesOpen(0, -20), false) // short
  assert.equal(settlesOpen(-140, -110), true) // short
  assert.equal(settlesOpen(-140, -60), false)
})
