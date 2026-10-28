import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agent } from '../../daemon.ts'
import { duration, paseoRow, providerRow, span, summary, took, type ProviderSubagent, type Row } from './rows.ts'

const row = (status: Row['status'], start: string, end?: string): Row => ({ kind: 'provider', id: start, provider: 'claude', label: 't', status, start, end })
const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()

test('the head counts what waits, runs and failed, else says done', () => {
  const rows = [row('running', at(0)), row('running', at(1)), row('done', at(2), at(44))]
  assert.deepEqual(summary(rows), { text: 'Delegated 3 tasks · 2 running', status: 'running' })
  assert.deepEqual(summary([row('input', at(0)), row('failed', at(0), at(1))]), { text: 'Delegated 2 tasks · 1 needs input · 1 failed', status: 'input' })
  assert.deepEqual(summary([row('done', at(0), at(1))]), { text: 'Delegated 1 task · done', status: 'done' })
  assert.deepEqual(summary([row('canceled', at(0), at(1))]), { text: 'Delegated 1 task · canceled', status: 'canceled' })
})

test('times run to now while a row goes on, else to its end', () => {
  const now = Date.parse(at(84))
  const rows = [row('running', at(0)), row('done', at(30), at(72))]
  assert.equal(duration(took(rows[0], now)), '1m 24s')
  assert.equal(duration(took(rows[1], now)), '42s')
  assert.equal(duration(span(rows, now)), '1m 24s')
  assert.equal(duration(span([rows[1], row('failed', at(10), at(20))], now)), '1m 2s')
  assert.equal(duration(2 * 3600_000 + 5 * 60_000), '2h 5m')
})

test('a provider subagent is named by its task; a Paseo agent waiting on a permission still runs', () => {
  const s = { id: 's', provider: 'claude', title: 'Explore', description: ' Find the retry path ', status: 'completed', createdAt: at(0), updatedAt: at(9) } as ProviderSubagent
  assert.deepEqual(providerRow(s), { kind: 'provider', id: 's', provider: 'claude', label: 'Find the retry path', status: 'done', start: at(0), end: at(9) })
  assert.equal(providerRow({ ...s, description: null }).label, 'Explore')
  const a = { id: 'a', provider: 'codex', title: null, status: 'running', pendingPermissions: [{}], createdAt: at(0), updatedAt: at(5) } as unknown as Agent
  assert.deepEqual(paseoRow(a), { kind: 'paseo', id: 'a', provider: 'codex', label: 'New agent', status: 'input', start: at(0), end: undefined })
  assert.equal(paseoRow({ ...a, status: 'error', pendingPermissions: [] }).end, at(5))
})
