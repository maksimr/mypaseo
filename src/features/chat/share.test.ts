import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineItem } from '../../daemon'
import type { RoomItem } from '../rooms/roomView'
import { contextOptions, markOf, ownMarks, pickRange, roomMarks, shareable } from './share.ts'

const at = (min: number) => `2025-01-01T10:${String(min).padStart(2, '0')}:00.000Z`
const room = (item: object, extra: Partial<RoomItem> = {}) =>
  ({ item: item as TimelineItem, timestamp: at(1), author: 'bob', agentId: 'b', private: false, key: 'k', ...extra }) as RoomItem
const reply = room({ type: 'assistant_message', text: 'hi', messageId: 'm1' })
const post = room({ type: 'plugin', pluginId: 'mypaseo-rooms', version: 1, id: 'p', kind: 'room.post', data: {} }, { author: 'user', agentId: 'lead' })
const mark = (min: number, messageId?: string) => ({ at: at(min), handle: 'bob', agentId: 'b', messageId })

test('shares public posts and agent messages only', () => {
  assert.equal(shareable(reply), true)
  assert.equal(shareable(post), true)
  assert.equal(shareable({ ...reply, private: true }), false)
  assert.equal(shareable(room({ type: 'user_message', text: 'typed in its chat' })), false)
  assert.equal(shareable(room({ type: 'plugin', pluginId: 'mypaseo-rooms', version: 1, id: 'j', kind: 'room.join', data: {} })), false)
  assert.deepEqual(markOf(reply), { at: at(1), handle: 'bob', agentId: 'b', messageId: 'm1' })
  assert.equal(markOf(post).messageId, undefined)
  assert.deepEqual(roomMarks([reply, { ...reply, private: true }]), [markOf(reply), undefined])
})

test('in a chat without a room, shares the agent messages a fork can end at', () => {
  const items = [
    { type: 'user_message', text: 'hi' },
    { type: 'assistant_message', text: 'hello', messageId: 'm1' },
    { type: 'assistant_message', text: 'no id' },
  ] as TimelineItem[]
  assert.deepEqual(ownMarks(items, [at(1), at(2), at(3)], 'b', 'bob'), [undefined, { ...mark(2, 'm1'), text: 'hello' }, undefined])
})

test('a pick starts the range over, Shift ends it in time order', () => {
  const a = mark(1)
  const b = mark(5)
  assert.deepEqual(pickRange(undefined, b, true), { from: b })
  assert.deepEqual(pickRange({ from: a, to: b }, b, false), { from: b })
  assert.deepEqual(pickRange({ from: a }, b, true), { from: a, to: b })
  assert.deepEqual(pickRange({ from: b }, a, true), { from: a, to: b })
})

test('in a room, offers the range and its fork for a picked message, and the whole room', () => {
  const ids = (o: ReturnType<typeof contextOptions>) => o.map(([id]) => id)
  assert.deepEqual(ids(contextOptions(undefined, false)), ['none'])
  assert.deepEqual(ids(contextOptions(undefined, true)), ['none', 'all'])
  assert.deepEqual(ids(contextOptions({ from: mark(1) }, true)), ['none', 'range', 'all'])
  // The fork ends at the range's end, which needs a messageId.
  assert.deepEqual(ids(contextOptions({ from: mark(1, 'm1'), to: mark(5) }, true)), ['none', 'range', 'all'])
  const options = contextOptions({ from: mark(1), to: mark(5, 'm5') }, true)
  assert.deepEqual(ids(options), ['none', 'range', 'all', 'fork'])
  assert.equal(options.at(-1)?.[1], 'Fork @bob')
  assert.match(options[1][1], /^\d\d:\d\d–\d\d:\d\d$/)
  assert.match(contextOptions({ from: mark(1) }, true)[1][1], /^From \d\d:\d\d$/)
})

test('without a room, offers a fork at each of the chat\'s messages, the latest first', () => {
  const ids = (o: ReturnType<typeof contextOptions>) => o.map(([id]) => id)
  const forks = [
    { ...mark(1, 'm1'), text: '# Remove a **specific** image with `docker rmi`, or force it with -f' },
    { ...mark(5, 'm5'), text: '```bash\ndocker images\n```' },
  ]
  assert.deepEqual(ids(contextOptions(undefined, false)), ['none'])
  // A picked message changes nothing here: the chip picks its fork.
  const options = contextOptions({ from: mark(1, 'm1') }, false, forks)
  assert.deepEqual(ids(options), ['none', 'fork:m5', 'fork:m1'])
  assert.match(options[1][1], /^Fork @bob \d\d:\d\d · docker images$/)
  assert.match(options[2][1], /· Remove a specific image with docker rmi, or for…$/)
})
