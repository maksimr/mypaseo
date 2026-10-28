import assert from 'node:assert/strict'
import { test } from 'node:test'
import { descendants, parentIn, subtree, topLevel } from './parent.ts'

const agent = (id: string, parent?: string, workspaceId = 'w') => ({ id, workspaceId, labels: parent ? { 'paseo.parent-agent-id': parent } : {} })

test('a subagent nests under its parent in its workspace; one in another workspace, or whose parent is gone, stands alone', () => {
  const [lead, sub, subsub, worktree, orphan] = [agent('lead'), agent('sub', 'lead'), agent('subsub', 'sub'), agent('wt', 'lead', 'x'), agent('o', 'gone')]
  const all = [lead, sub, subsub, worktree, orphan]
  assert.equal(parentIn(sub, all), lead)
  assert.equal(parentIn(worktree, all), undefined)
  assert.deepEqual(topLevel(all), [lead, worktree, orphan])
  assert.deepEqual(descendants(all, [lead]), [sub, subsub])
  assert.deepEqual(descendants(all, [orphan]), [])
})

test('a subtree lists each subagent right after its parent, one level deeper, under open agents only', () => {
  const [lead, a, b, aa] = [agent('lead'), agent('a', 'lead'), agent('b', 'lead'), agent('aa', 'a')]
  const all = [lead, a, b, aa]
  assert.deepEqual(subtree(lead, all, new Set(['lead', 'a'])), [
    { agent: a, depth: 1 },
    { agent: aa, depth: 2 },
    { agent: b, depth: 1 },
  ])
  assert.deepEqual(subtree(lead, all, new Set(['lead'])), [
    { agent: a, depth: 1 },
    { agent: b, depth: 1 },
  ])
  assert.deepEqual(subtree(lead, all, new Set(['a'])), [])
})
