import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropImageRef, imageRef } from './imageRefs.ts'

test('removing an image drops its ref and renumbers later ones', () => {
  const text = `compare ${imageRef(1)} with ${imageRef(2)} and ${imageRef(12)} `
  assert.equal(dropImageRef(text, 2), 'compare [Image #1] with and [Image #11] ')
  assert.equal(dropImageRef(text, 1), 'compare with [Image #1] and [Image #11] ')
  assert.equal(dropImageRef('no refs', 1), 'no refs')
})
