import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archivedWorkspaces, type HistoryEntry } from './archived.ts'

const entry = (id: string, workspaceId: string, archivedAt: string | null) =>
  ({
    agent: { id, workspaceId, archivedAt, cwd: '/repo' },
    project: { workspaceName: `name ${workspaceId}`, checkout: { currentBranch: 'main' } },
  }) as HistoryEntry

test('groups archived agents outside the active workspaces, newest workspace first', () => {
  const entries = [
    entry('old', 'w1', '2026-01-01T00:00:00Z'),
    entry('closed', 'w2', '2026-01-02T00:00:00Z'),
    entry('a', 'w2', '2026-01-05T00:00:00Z'),
    entry('b', 'w2', '2026-01-05T00:00:30Z'),
    entry('live', 'w3', null),
    entry('elsewhere', 'active', '2026-01-09T00:00:00Z'),
  ]
  const list = archivedWorkspaces(entries, ['active'])
  assert.deepEqual(
    list.map((w) => [w.id, w.name, w.agentIds, w.restoreIds]),
    [
      ['w2', 'name w2', ['closed', 'a', 'b'], ['a', 'b']],
      ['w1', 'name w1', ['old'], ['old']],
    ],
  )
})
