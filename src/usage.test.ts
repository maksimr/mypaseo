import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UsageReport } from './daemon.ts'
import { balanceAmount, formatCost, formatTokens, resetLabel, upsertReport, windowTone, windowTrailing } from './usage.ts'

const now = Date.parse('2026-01-01T00:00:00Z')
const at = (min: number) => new Date(now + min * 60_000).toISOString()

test('formats tokens and cost', () => {
  assert.equal(formatTokens(28_400), '28k')
  assert.equal(formatTokens(1_000_000), '1m')
  assert.equal(formatTokens(512), '512')
  assert.equal(formatCost(0.128), '$0.13')
  assert.equal(formatCost(0.0042), '$0.0042')
})

test('reset label counts down in the largest whole unit', () => {
  assert.equal(resetLabel(at(17), now), 'resets 17m')
  assert.equal(resetLabel(at(3 * 24 * 60 + 5), now), 'resets 3d')
  assert.equal(resetLabel(at(-1), now), 'resetting now')
  assert.equal(resetLabel(null, now), null)
})

test('window tone and trailing text', () => {
  assert.equal(windowTone({ id: 's', label: 'Session', usedPct: 95 }), 'danger')
  assert.equal(windowTone({ id: 's', label: 'Session', remainingPct: 25 }), 'warning')
  assert.equal(windowTone({ id: 's', label: 'Session', usedPct: 95, tone: 'ok' }), 'ok')
  assert.deepEqual(windowTrailing({ id: 's', label: 'S', resetsAt: at(120) }, now), { text: 'resets 2h', atRisk: false })
  assert.deepEqual(windowTrailing({ id: 's', label: 'S', runsOutAt: at(30), shortfallPct: 10 }, now), { text: 'runs out 30m', atRisk: true })
})

test('balance amount', () => {
  assert.deepEqual(balanceAmount({ id: 'b', label: 'Credits', unit: 'tokens', remaining: 750, limit: 1000 }), { text: '250 / 1k', pct: 25 })
  assert.equal(balanceAmount({ id: 'b', label: 'Credits', unit: 'credits', remaining: 5 }).text, '5 left')
})

test('upsert replaces by id or appends', () => {
  const r = (id: string, fetchedAt = 'a') => ({ id, fetchedAt }) as UsageReport
  assert.deepEqual(upsertReport(undefined, r('x')), [r('x')])
  assert.deepEqual(upsertReport([r('x'), r('y')], r('x', 'b')), [r('x', 'b'), r('y')])
})
