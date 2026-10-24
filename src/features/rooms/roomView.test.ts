import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineItem } from '../../daemon'
import { deliveryOf, mergeRoom } from './roomView.ts'

type Data = Extract<TimelineItem, { type: 'plugin' }>['data']
const ts = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()
const user = (text: string, messageId = 'u'): TimelineItem => ({ type: 'user_message', text, messageId })
const says = (text: string): TimelineItem => ({ type: 'assistant_message', text })
const think = (text: string): TimelineItem => ({ type: 'reasoning', text })
// After a rebuild the messageId is the provider's: only the marker on the last line tells a delivery.
const deliver = (id: string, s: number, dm = false) => user(`room line\nuser → you\n⟦mpr${dm ? '-dm' : ''}:${id} ${ts(s)}⟧`, 'provider-id')
const room = (id: string, kind: string, data: Data): TimelineItem => ({ type: 'plugin', id, pluginId: 'mypaseo-rooms', kind, version: 1, data })
const post = (id: string, to: string[], dm = false) => room(id, 'room.post', { id, text: id, to, dm, images: 0, files: [] })
const join = room('j1', 'room.join', { handles: ['code-reviewer'], context: 'none' })
const member = (agentId: string, handle: string, entries: [number, TimelineItem][]) => ({
  agentId,
  handle,
  entries: entries.map(([s, item]) => ({ item, timestamp: ts(s) })),
})
const text = (i: TimelineItem) => (i.type === 'plugin' ? i.id : 'text' in i ? i.text : i.type)
const order = (items: ReturnType<typeof mergeRoom>) => items.map((r) => [r.agentId, r.author, text(r.item), r.private])

test('deliveryOf reads the marker on the last line of a user message, not the messageId', () => {
  const at = '2026-01-01T00:00:05.000Z'
  assert.deepEqual(deliveryOf(user(`attachment\n\nroom line\n⟦mpr:p1 ${at}⟧`)), { dm: false, at })
  assert.deepEqual(deliveryOf(user(`room line\n⟦mpr-dm:p1 ${at}⟧ \n\n`)), { dm: true, at })
  assert.equal(deliveryOf(user(`⟦mpr:p1 ${at}⟧\nmore`)), null)
  assert.equal(deliveryOf(user(`see ⟦mpr:p1 ${at}⟧`)), null)
  assert.equal(deliveryOf(user('hi', 'mpr:p1')), null)
  assert.equal(deliveryOf({ type: 'assistant_message', text: `⟦mpr:p1 ${at}⟧` }), null)
})

test('merges two members into one conversation with a DM turn', () => {
  const lead = member('a1', 'agent', [
    [0, user('hi')], // typed in the lead's chat before it became a room
    [1, says('hello')],
    [2, join],
    [2, post('p1', ['code-reviewer'])],
    [5, post('p2', ['agent'], true)],
    [5, deliver('p2', 5, true)],
    [6, think('hm')],
    [6, says('secret')],
    [7, deliver('p3', 7)],
    [8, says('thanks')],
  ])
  const reviewer = member('a2', 'code-reviewer', [
    [3, deliver('p1', 3)],
    [4, think('reading')],
    [6, says('LGTM @agent')], // ties with the lead's DM turn: the lead, listed first, stays first
    [7, post('x', [])], // not on the lead: dropped
    [9, user('typed in my chat')],
    [10, says('done')],
  ])
  const merged = mergeRoom([lead, reviewer], 'a1')
  assert.deepEqual(order(merged), [
    ['a1', 'user', 'hi', false],
    ['a1', 'agent', 'hello', false],
    ['a1', 'agent', 'j1', false],
    ['a1', 'user', 'p1', false],
    ['a2', 'code-reviewer', 'reading', false],
    ['a1', 'user', 'p2', true],
    ['a1', 'agent', 'hm', true],
    ['a1', 'agent', 'secret', true],
    ['a2', 'code-reviewer', 'LGTM @agent', false],
    ['a1', 'agent', 'thanks', false],
    ['a2', 'user', 'typed in my chat', false],
    ['a2', 'code-reviewer', 'done', false],
  ])
  assert.deepEqual(merged.slice(0, 4).map((r) => r.key), ['a1:0', 'a1:1', 'room:j1', 'room:p1'])
  assert.equal(merged[4].timestamp, ts(4))
})

test('a rebuilt timeline (every entry at the rebuild time) sorts each turn at the delivery that opened it', () => {
  const lead = member('a1', 'agent', [
    [10, join],
    [11, post('p1', ['code-reviewer'])],
    [20, post('p2', ['code-reviewer'])],
    [30, post('p3', [])],
    [31, deliver('p3', 31)],
    [32, says('lead on p3')],
    [100, post('p4', ['code-reviewer'])],
  ])
  const reviewer = member('a2', 'code-reviewer', [
    [99, deliver('p1', 12)],
    [99, think('reading')],
    [99, says('r1')],
    [99, deliver('p2', 21)],
    [99, says('r2')],
    [99, user('typed in my chat')],
    [99, says('r typed')],
    [99, deliver('p3', 31)],
    [99, says('r3')], // the last turn before the rebuild keeps its own time
    [101, deliver('p4', 101)], // live again after the rebuild
    [102, says('r4')],
  ])
  const merged = mergeRoom([lead, reviewer], 'a1')
  assert.deepEqual(
    merged.map((r) => text(r.item)),
    ['j1', 'p1', 'reading', 'r1', 'p2', 'r2', 'typed in my chat', 'r typed', 'p3', 'lead on p3', 'r3', 'p4', 'r4'],
  )
  assert.ok(merged.filter((r) => r.agentId === 'a2' && r.key !== 'a2:10').every((r) => r.timestamp === ts(99)))
})

test("a rebuilt lead: pre-room history first, room items from the log once per id, winning ties with their turn", () => {
  const lead = member('a1', 'agent', [
    [99, user('hi')],
    [99, says('hello')],
    [99, deliver('p2', 20)],
    [99, says('lead r2')],
    [99, deliver('p3', 40)],
    [99, says('lead r3')],
    // room.log, then a live item it already holds
    [10, join],
    [11, post('p1', ['code-reviewer'])],
    [20, post('p2', [])],
    [40, post('p3', [])],
    [40, post('p3', [])],
  ])
  const reviewer = member('a2', 'code-reviewer', [
    [12, deliver('p1', 12)],
    [13, says('r1')],
    [20, deliver('p2', 20)],
    [22, says('r2')],
    [40, deliver('p3', 40)],
    [41, says('r3')],
  ])
  assert.deepEqual(
    mergeRoom([lead, reviewer], 'a1').map((r) => text(r.item)),
    ['hi', 'hello', 'j1', 'p1', 'r1', 'p2', 'lead r2', 'r2', 'p3', 'r3', 'lead r3'],
  )
})
