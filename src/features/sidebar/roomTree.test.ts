import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomTree } from './roomTree.ts'

const agent = (id: string, room?: string) => ({ id, labels: room ? { 'mypaseo.room': room } : {} })

test('members follow their lead in list order; a member without its lead and a lone lead stay plain rows', () => {
  const [m2, solo, lead, m1, orphan, lone] = [agent('m2', 'l'), agent('s'), agent('l', 'l'), agent('m1', 'l'), agent('o', 'gone'), agent('k', 'k')]
  const row = (a: typeof solo, nested = false, room = 0) => ({ agent: a, nested, room })
  assert.deepEqual(roomTree([m2, solo, lead, m1, orphan, lone]), [
    row(solo),
    row(lead, false, 3),
    row(m2, true),
    row(m1, true),
    row(orphan),
    row(lone),
  ])
})
