import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layout } from './graph.ts'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })

test('linear history stays in one lane and ends at the root', () => {
  const { rows, width } = layout([c('b', 'a'), c('a')])
  assert.equal(width, 1)
  assert.deepEqual(rows, [
    { lane: 0, lines: [{ from: 0, to: 0, lane: 0 }] },
    { lane: 0, lines: [] },
  ])
})

test('a merged branch opens a lane at the merge and joins back at the fork point', () => {
  // m merges x (on the branch) into a; x's parent y forks from a.
  const { rows, width } = layout([c('m', 'a', 'x'), c('x', 'y'), c('y', 'a'), c('a')])
  assert.equal(width, 2)
  assert.deepEqual(
    rows.map((r) => r.lane),
    [0, 1, 1, 0],
  )
  assert.deepEqual(rows[0].lines, [
    { from: 0, to: 0, lane: 0 },
    { from: 0, to: 1, lane: 1 },
  ])
  assert.deepEqual(rows[2].lines, [
    { from: 0, to: 0, lane: 0 },
    { from: 1, to: 0, lane: 1 },
  ])
  assert.deepEqual(rows[3].lines, [])
})

test('a merge parent already on a lane joins that lane', () => {
  // m merges b, which tip t's lane already waits for.
  const { rows } = layout([c('t', 'b'), c('m', 'a', 'b'), c('b', 'a'), c('a')])
  assert.deepEqual(
    rows.map((r) => r.lane),
    [0, 1, 0, 0],
  )
  assert.deepEqual(rows[1].lines, [
    { from: 0, to: 0, lane: 0 },
    { from: 1, to: 1, lane: 1 },
    { from: 1, to: 0, lane: 0 },
  ])
})

test('a freed lane is reused by the next branch tip', () => {
  const { rows, width } = layout([c('x', 'a'), c('a'), c('y')])
  assert.equal(width, 1)
  assert.equal(rows[2].lane, 0)
})
