import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keyboardView } from './viewport.ts'

test('the app fits what the keyboard leaves visible', () => {
  assert.deepEqual(keyboardView(844, { height: 508, pageTop: 336, scale: 1 }), { height: 508, top: 336 })
})

test('no keyboard, or pinch zoom: the app keeps the window', () => {
  assert.equal(keyboardView(844, { height: 844, pageTop: 0, scale: 1 }), null)
  assert.equal(keyboardView(844, { height: 843.6, pageTop: 0, scale: 1 }), null) // rounding
  assert.equal(keyboardView(844, { height: 422, pageTop: 200, scale: 2 }), null)
})
