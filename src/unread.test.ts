import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agent } from './daemon.ts'
import { unreadPick } from './unread.ts'

const agent = (id: string, updatedAt: string, a: Partial<Agent> = {}) =>
  ({ id, updatedAt, workspaceId: 'w', status: 'idle', pendingPermissions: [], requiresAttention: false, labels: {}, ...a }) as Agent

test('picks the most recently updated finished, read, top-level agent of the workspace', () => {
  const agents = [
    agent('old', '2026-01-01'),
    agent('latest', '2026-01-03'),
    agent('running', '2026-01-09', { status: 'running' }),
    agent('unread', '2026-01-09', { requiresAttention: true }),
    agent('asking', '2026-01-09', { pendingPermissions: [{}] as Agent['pendingPermissions'] }),
    agent('sub', '2026-01-09', { labels: { 'paseo.parent-agent-id': 'latest' } }),
    agent('elsewhere', '2026-01-09', { workspaceId: 'x' }),
  ]
  assert.equal(unreadPick(agents, 'w')?.id, 'latest')
  assert.equal(unreadPick([agent('busy', '2026-01-01', { status: 'running' })], 'w'), undefined)
})
