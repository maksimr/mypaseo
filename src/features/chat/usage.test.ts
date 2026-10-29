import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UsageReport } from '../../daemon.ts'
import { balanceAmount, formatCost, formatTokens, loadAgentUsage, resetLabel, updatedLabel, upsertReport, usageScope, windowTone, windowTrailing } from './usage.ts'

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

test('updated label counts up in the largest whole unit', () => {
  assert.equal(updatedLabel(at(-0.5), now), 'Updated just now')
  assert.equal(updatedLabel(at(-1), now), 'Updated 1m ago')
  assert.equal(updatedLabel(at(-125), now), 'Updated 2h ago')
  assert.equal(updatedLabel(at(-3 * 24 * 60), now), 'Updated 3d ago')
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

test('usage scope keeps account-specific reports on hosts with usage sources', () => {
  assert.deepEqual(usageScope({ id: 'agent-1', provider: 'codex' }, true), { agentId: 'agent-1' })
})

test('legacy usage requests select the provider without an agentId', () => {
  for (const provider of ['codex', 'claude'] as const) {
    const scope = usageScope({ id: 'agent-1', provider }, false)
    assert.deepEqual(scope, { reportIds: [provider] })
    assert.equal('agentId' in scope, false)
  }
})

test('pi Codex models use the Codex usage source on legacy hosts', () => {
  for (const model of ['openai-codex/gpt-model', 'openai/gpt-model']) {
    assert.deepEqual(usageScope({ id: 'agent-1', provider: 'pi', model }, false), { reportIds: ['codex'] })
  }
  assert.deepEqual(usageScope({ id: 'agent-1', provider: 'pi', model: 'anthropic/claude-model' }, false), { reportIds: ['pi'] })
})

const weekly: UsageReport = {
  id: 'codex:account', sourceId: 'codex', sourceLabel: 'Codex', account: {}, fetchedAt: at(0),
  report: { status: 'available', windows: [{ id: 'weekly', label: 'Weekly', usedPct: 2, resetsAt: at(7 * 24 * 60) }] },
}
const piCodex = { id: 'agent-1', provider: 'pi', model: 'openai-codex/gpt-model' }

function usageDaemon(...responses: UsageReport[][]) {
  type Client = Parameters<typeof loadAgentUsage>[0]
  const calls: Parameters<Client['listUsageReports']>[0][] = []
  const daemon: Client = {
    async listUsageReports(options, onReport) {
      calls.push(options)
      const reports = responses.shift() ?? []
      reports.forEach((r) => onReport?.(r))
      return { requestId: 'test', reports }
    },
  }
  return { daemon, calls }
}

test('empty pi session usage falls back to host Codex weekly usage, excluding other sources', async () => {
  const { daemon, calls } = usageDaemon([], [weekly, { ...weekly, id: 'copilot', sourceId: 'copilot' }])
  const result = await loadAgentUsage(daemon, piCodex, true, { forceRefresh: true })
  assert.deepEqual(result, { reports: [weekly], hostWide: true })
  assert.deepEqual(calls, [{ agentId: piCodex.id, forceRefresh: true }, { forceRefresh: true }])
})

test('scoped reports, including account errors, never fall back to another account', async () => {
  const failure: UsageReport = { ...weekly, report: { status: 'error', error: 'Login failed' } }
  for (const entry of [weekly, failure]) {
    const { daemon, calls } = usageDaemon([entry])
    const streamed: UsageReport[] = []
    assert.deepEqual(await loadAgentUsage(daemon, piCodex, true, { onReport: (r) => streamed.push(r) }), { reports: [entry], hostWide: false })
    assert.deepEqual(streamed, [entry])
    assert.equal(calls.length, 1)
  }
})

test('legacy pi Codex usage selects the Codex report without an agent query', async () => {
  const { daemon, calls } = usageDaemon([weekly])
  assert.deepEqual(await loadAgentUsage(daemon, piCodex, false), { reports: [weekly], hostWide: true })
  assert.deepEqual(calls, [{ reportIds: ['codex'], forceRefresh: undefined }])
})

test('empty non-Codex sessions do not fetch unrelated host accounts', async () => {
  const { daemon, calls } = usageDaemon([])
  const result = await loadAgentUsage(daemon, { ...piCodex, model: 'anthropic/claude-model' }, true)
  assert.deepEqual(result, { reports: [], hostWide: false })
  assert.equal(calls.length, 1)
})

test('upsert replaces by id or appends', () => {
  const r = (id: string, fetchedAt = 'a') => ({ id, fetchedAt }) as UsageReport
  assert.deepEqual(upsertReport(undefined, r('x')), [r('x')])
  assert.deepEqual(upsertReport([r('x'), r('y')], r('x', 'b')), [r('x', 'b'), r('y')])
})
