import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOP_LIMIT, admit, deliveryText, digest, marker, mentions, nextBatch, replyText, sharedPosts } from './route.ts'
import type { Message, Post } from './route.ts'

const handles = ['agent', 'code-reviewer', 'code-reviewer-2']

// jscpd:ignore-start
// The same table as src/features/rooms/mentions.test.ts, for the plugin's twin of the parser.
test("the Contract's mention table", () => {
  const table: [string, string[]][] = [
    ['@agent fix it', ['agent']],
    ['ask @Code-Reviewer, then @agent.', ['code-reviewer', 'agent']],
    ['@code-reviewer-2 too', ['code-reviewer-2']],
    ['@agentic', []],
    ['mail bob@agent.com', []],
    ['`@agent` and\n```ts\n@agent\n```\n', []],
    ['npm i @types/react', []],
    ['(@agent)', ['agent']],
  ]
  for (const [text, expected] of table) assert.deepEqual(mentions(text, handles), expected, text)
})
// jscpd:ignore-end

const at = (minute: number) => `2026-01-01T10:${String(minute).padStart(2, '0')}:00.000Z`
const delivery = (dm: boolean) => ({ type: 'user_message', text: `user → everyone:\nhi\n\n${marker('d1', dm, at(0))}` })

test('routing: a public delivery turn posts its last reply, a DM or own-chat turn posts nothing', () => {
  const reply = [
    { type: 'assistant_message', text: 'old turn' },
    delivery(false),
    { type: 'assistant_message', text: 'looking' },
    { type: 'tool_call' },
    { type: 'assistant_message', text: '@code-reviewer please check, @agent too' },
  ]
  assert.equal(replyText(reply), '@code-reviewer please check, @agent too')
  // Its recipients: the other members it mentions.
  assert.deepEqual(mentions(replyText(reply)!, ['code-reviewer']), ['code-reviewer'])
  assert.equal(replyText([delivery(true), { type: 'assistant_message', text: '@agent psst' }]), null)
  assert.equal(replyText([delivery(false), { type: 'assistant_message', text: 'a' }, { type: 'user_message', text: 'typed' }, { type: 'assistant_message', text: 'b' }]), null)
  assert.equal(replyText([delivery(false), { type: 'tool_call' }]), null)
  assert.equal(replyText([{ type: 'user_message', text: `${marker('d1', false, at(0))}\nnot last` }, { type: 'assistant_message', text: 'a' }]), null)
})

const msg = (id: string, dm = false): Message => ({ id, author: 'user', to: dm ? ['agent'] : [], text: id, at: at(1), dm })

test('batching: queued public messages go as one turn, a DM alone', () => {
  const [a, b, c, d] = [msg('a'), msg('b', true), msg('c'), msg('d', true)]
  assert.deepEqual(nextBatch([a, b, c, d]), [a, c])
  assert.deepEqual(nextBatch([b, a, c]), [b])
  assert.deepEqual(nextBatch([]), [])
})

test('the loop guard lets HOP_LIMIT agent-triggered deliveries through, then holds', () => {
  const guard = { hops: 0 }
  for (let i = 0; i < HOP_LIMIT; i++) assert.equal(admit(guard), true)
  assert.equal(admit(guard), false)
  assert.equal(guard.hops, HOP_LIMIT)
})

test('digest: unseen posts by others, newest 20, each cut to 2000 characters', () => {
  const posts: Post[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, author: i % 5 ? 'agent' : 'code-reviewer', to: [], text: `post ${i}`, at: at(i) }))
  posts[39].text = 'x'.repeat(2500)
  const member = { handle: 'code-reviewer', joined: at(2), delivered: at(4) }
  const seen = digest(posts, member, [{ ...msg('p28'), at: at(28) }])
  assert.equal(seen.length, 20)
  assert.deepEqual(seen.slice(0, 2).map((p) => p.id), ['p14', 'p16']) // after p4, not its own (every fifth), not p28
  assert.ok(!seen.some((p) => p.author === 'code-reviewer' || p.id === 'p28'))
  assert.equal(seen.at(-1)!.text, `${'x'.repeat(2000)}… (truncated)`)
  assert.equal(posts[39].text.length, 2500)
  const emoji = { ...posts[39], text: `${'x'.repeat(1999)}🏓${'y'.repeat(600)}` }
  assert.equal(digest([emoji], member, [])[0].text, `${'x'.repeat(1999)}… (truncated)`)
  assert.deepEqual(digest(posts, { handle: 'agent', joined: at(34) }, []).map((p) => p.id), ['p35'])
})

test('shared context: posts in the range, both ends included', () => {
  const posts: Post[] = [3, 1, 2, 4].map((m) => ({ id: `p${m}`, author: 'user', to: [], text: '', at: at(m) }))
  assert.deepEqual(sharedPosts(posts, at(2), at(3)).map((p) => p.id), ['p2', 'p3'])
  assert.deepEqual(sharedPosts(posts, undefined, at(2)).map((p) => p.id), ['p1', 'p2'])
})

test('delivery text: room line, role, digest, messages, marker last', () => {
  const text = deliveryText({
    handle: 'code-reviewer',
    others: [{ handle: 'agent', model: 'pi/haiku' }],
    notes: 'Review diffs.',
    digest: [{ id: 'p1', author: 'agent', to: [], text: 'done', at: at(1) }],
    messages: [{ ...msg('m1', true), to: ['code-reviewer', 'agent'] }],
    marker: marker('d1', true, at(2)),
  })
  assert.match(text, /^\[Group chat\] You are @code-reviewer, talking with the user and the agents @agent \(pi\/haiku\)\. This is a direct message/)
  assert.match(text, /\n\nYour role: Review diffs\.\n\nSince your last turn:\n\n@agent → user:\ndone\n\nuser → you, @agent \(direct\):\nm1\n\n/)
  assert.equal(text.split('\n').at(-1), `⟦mpr-dm:d1 ${at(2)}⟧`)
  const lone = deliveryText({ handle: 'agent', others: [], digest: [], messages: [msg('m2')], marker: '' })
  assert.match(lone, /^\[Group chat\] You are @agent, talking with the user\. To hand off/)
  assert.doesNotMatch(lone, /role|Since|agents/)
})
