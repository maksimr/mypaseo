import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BLOB, blobOf, EYES, iconOf, outline, RADIUS, randomBlob, SHAPES } from './blob.ts'

test('blobOf draws a blob only from blob:<body> or blob:<body>:<eyes>', () => {
  for (const icon of [
    undefined,
    '',
    'code',
    'blob:',
    'blob:x',
    'blob:-1',
    ' blob:circle',
    'blob:Circle',
    'blob:clover',
    'blob:circle:',
    'blob:circle:wink',
    'blob:40,40',
    `blob:40,40,${RADIUS.max + 1}`,
    `blob:40,40,${RADIUS.min - 1}`,
  ])
    assert.equal(blobOf(icon), undefined, icon)
  for (const s of SHAPES) assert.deepEqual(blobOf(`blob:${s}`), { body: s, eyes: 'tall' })
  assert.deepEqual(blobOf('blob:30,45,40:dash'), { body: [30, 45, 40], eyes: 'dash' })
})

test('iconOf writes what blobOf reads, the default eyes left out', () => {
  assert.equal(iconOf({ body: 'circle', eyes: 'tall' }), 'blob:circle')
  assert.equal(iconOf({ body: BLOB, eyes: 'glint' }), `blob:${BLOB.join(',')}:glint`)
  for (const body of [...SHAPES, BLOB]) for (const eyes of EYES) assert.deepEqual(blobOf(iconOf({ body, eyes })), { body, eyes })
})

test('a random blob is a custom one blobOf reads back', () => {
  for (let i = 0; i < 100; i++) {
    const b = randomBlob()
    assert.ok(Array.isArray(b.body) && b.body.length === BLOB.length)
    assert.deepEqual(blobOf(iconOf(b)), b)
  }
})

test('an outline is a closed path of one curve per point', () => {
  assert.match(outline(BLOB), new RegExp(`^M[\\d. ]+(C[\\d. ]+){${BLOB.length}}Z$`))
})
