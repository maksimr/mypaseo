import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inOrder, moveId } from './order.ts'

test('sorts by the saved order, unsaved items last in their own order', () => {
  assert.deepEqual(inOrder(['new1', 'a', 'b', 'new2'], ['b', 'gone', 'a'], (x) => x), ['b', 'a', 'new1', 'new2'])
})

test('moves an id before or after the target and keeps saved ids that are not listed', () => {
  assert.deepEqual(moveId(['a', 'b', 'c'], [], 'a', 'c', true), ['b', 'c', 'a'])
  assert.deepEqual(moveId(['a', 'b', 'c'], [], 'c', 'a', false), ['c', 'a', 'b'])
  assert.deepEqual(moveId(['a', 'b'], ['x', 'b', 'a'], 'a', 'b', false), ['a', 'b', 'x'])
})
