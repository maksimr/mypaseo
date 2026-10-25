import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleOf, isLead, lookOf, roomId, roomMembers } from './members.ts'

const agent = (id: string, labels: Record<string, string>, archivedAt: string | null = null) => ({ id, labels, archivedAt })

const lead = agent('a1', { 'mypaseo.room': 'a1', 'mypaseo.handle': 'agent' })
const reviewer = agent('a2', { 'mypaseo.room': 'a1', 'mypaseo.handle': 'code-reviewer', 'mypaseo.profile': 'p1' })
const gone = agent('a3', { 'mypaseo.room': 'a1', 'mypaseo.handle': 'tester' }, '2026-01-01T00:00:00Z')
const elsewhere = agent('b1', { 'mypaseo.room': 'b1' })
const single = agent('c1', { 'mypaseo.profile': 'p1' })

test('room membership comes from the labels, without archived agents', () => {
  assert.equal(roomId(reviewer), 'a1')
  assert.equal(roomId(single), undefined)
  assert.deepEqual(roomMembers([lead, single, reviewer, gone, elsewhere], 'a1'), [lead, reviewer])
  assert.deepEqual([lead, reviewer, elsewhere, single].map(isLead), [true, false, true, false])
})

test('handleOf: the label, else the profile slug, else agent', () => {
  const profiles = [{ id: 'p1', name: 'Code Reviewer' }]
  assert.equal(handleOf(reviewer, profiles), 'code-reviewer')
  assert.equal(handleOf(single, profiles), 'code-reviewer')
  assert.equal(handleOf(single, []), 'agent')
  assert.equal(handleOf(elsewhere, profiles), 'agent')
})

test("lookOf: its profile's color name or #rrggbb, else none", () => {
  const colorOf = (a: typeof lead, profiles: { id: string; color?: string }[]) => lookOf(a, profiles).color
  assert.equal(colorOf(reviewer, [{ id: 'p1', color: 'teal' }]), 'var(--identity-teal)')
  assert.equal(colorOf(reviewer, [{ id: 'p1', color: '#12abEF' }]), '#12abEF')
  assert.equal(colorOf(reviewer, [{ id: 'p1', color: 'lime' }]), undefined)
  assert.equal(colorOf(reviewer, [{ id: 'p1', color: 'none' }]), undefined)
  assert.equal(colorOf(reviewer, [{ id: 'p1' }]), undefined)
  assert.equal(colorOf(lead, [{ id: 'p1', color: 'teal' }]), undefined)
})

test("lookOf: the default agent's look on an agent started from no profile only", () => {
  const def = { color: 'sky', icon: 'blob:1' }
  assert.deepEqual(lookOf(lead, [], def), { color: 'var(--identity-sky)', icon: 'blob:1' })
  assert.deepEqual(lookOf(reviewer, [{ id: 'p1', icon: 'blob:2' }], def), { color: undefined, icon: 'blob:2' })
  // A removed profile's agent isn't the default agent.
  assert.deepEqual(lookOf(reviewer, [], def), { color: undefined, icon: undefined })
})
