import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeTrigger, completion, rankCommands } from './autocomplete.ts'

test('@ triggers anywhere, up to the cursor, and stops at whitespace or quotes', () => {
  assert.deepEqual(activeTrigger('see @src/ch', 11), { kind: '@', start: 4, end: 11, query: 'src/ch' })
  assert.deepEqual(activeTrigger('a@b@c', 5), { kind: '@', start: 3, end: 5, query: 'c' })
  assert.deepEqual(activeTrigger('@', 1), { kind: '@', start: 0, end: 1, query: '' })
  assert.equal(activeTrigger('@foo bar', 8), null)
  assert.equal(activeTrigger('"@foo" ', 7), null)
  assert.deepEqual(activeTrigger('@foo bar', 3), { kind: '@', start: 0, end: 3, query: 'fo' })
})

test('/ triggers at the start or after whitespace, never inside a path', () => {
  assert.deepEqual(activeTrigger('/rev', 4), { kind: '/', start: 0, end: 4, query: 'rev' })
  assert.deepEqual(activeTrigger('fix it /sk', 10), { kind: '/', start: 7, end: 10, query: 'sk' })
  assert.equal(activeTrigger('src/foo', 7), null)
  assert.equal(activeTrigger('/a/b', 4), null)
  assert.equal(activeTrigger('/review now', 11), null)
})

test('completion adds a trailing space only at the end of the text and quotes paths', () => {
  assert.equal(completion({ kind: '/', start: 0, end: 2, query: 'r' }, 'review', '/r'), '/review ')
  assert.equal(completion({ kind: '/', start: 0, end: 2, query: 'r' }, 'review', '/r more'), '/review')
  assert.equal(completion({ kind: '@', start: 0, end: 2, query: 'a' }, 'a "b".ts', '@a'), '"a \\"b\\".ts"')
})

test('commands rank exact, prefix, word start, substring', () => {
  const cmds = [{ name: 'paseo_tree' }, { name: 'pr-review' }, { name: 'reviewer' }, { name: 'init' }, { name: 're' }]
  assert.deepEqual(rankCommands(cmds, 'RE').map((c) => c.name), ['re', 'reviewer', 'pr-review', 'paseo_tree'])
  assert.equal(rankCommands(cmds, ''), cmds)
})
