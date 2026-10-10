import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyStreamItem } from './timeline.ts'

test('merges streamed deltas the way the daemon projects them', () => {
  const chunks = [
    { type: 'user_message', text: 'hi', messageId: 'u1' },
    { type: 'reasoning', text: 'The user' },
    { type: 'reasoning', text: ' wants' },
    { type: 'tool_call', callId: 'c1', name: 'bash', status: 'running', error: null, detail: { type: 'shell', command: 'ls' } },
    { type: 'tool_call', callId: 'c1', name: 'bash', status: 'completed', error: null, detail: { type: 'shell', command: 'ls', output: 'a' } },
    { type: 'assistant_message', text: 'Two', messageId: 'm1' },
    { type: 'assistant_message', text: ' files.', messageId: 'm1' },
    { type: 'assistant_message', text: 'Next', messageId: 'm2' },
    { type: 'user_message', text: 'hi', messageId: 'u1' },
  ] as Parameters<typeof applyStreamItem>[1][]
  const items = chunks.reduce(applyStreamItem, [])
  assert.deepEqual(
    items.map((i) => [i.type, 'text' in i ? i.text : i.type === 'tool_call' ? i.status : '']),
    [
      ['user_message', 'hi'],
      ['reasoning', 'The user wants'],
      ['tool_call', 'completed'],
      ['assistant_message', 'Two files.'],
      ['assistant_message', 'Next'],
    ],
  )
})
