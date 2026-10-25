import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blobOf, newBlob } from './blob.ts'

test('blobOf draws a blob only from blob:<seed>', () => {
  for (const icon of [undefined, '', 'code', 'blob:', 'blob:x', 'blob:-1', ' blob:1']) assert.equal(blobOf(icon), undefined, icon)
  assert.ok(blobOf(newBlob()))
})

test('a seed draws the same blob every time, its tilt and gaze in range', () => {
  for (let seed = 0; seed < 200; seed++) {
    const b = blobOf(`blob:${seed}`)!
    assert.deepEqual(blobOf(`blob:${seed}`), b)
    assert.ok(Math.abs(b.tilt) <= 14 && Math.abs(b.look.x) <= 7 && Math.abs(b.look.y) <= 5)
  }
})
