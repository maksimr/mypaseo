import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineItem } from '../../daemon'
import { doing, rows, summary, type Step } from './work.ts'

const tool = (detail: object, status = 'completed', name = 'tool') =>
  ({ type: 'tool_call', callId: String(Math.random()), name, status, error: null, detail }) as Step
const thought = { type: 'reasoning', text: 'hm' } as Step
const say = (text: string) => ({ type: 'assistant_message', text }) as TimelineItem

test('groups the runs of tool calls and thoughts between the other items', () => {
  const items = [{ type: 'user_message', text: 'hi' } as TimelineItem, thought, tool({ type: 'shell', command: 'ls' }), say('a'), tool({ type: 'shell', command: 'pwd' })]
  assert.deepEqual(
    rows(items).map((r) => ('steps' in r ? [r.index, r.steps.length] : r.index)),
    [0, [1, 2], 3, [4, 1]],
  )
})

test('says what the last step is doing', () => {
  assert.equal(doing(tool({ type: 'read', filePath: '/a/b/models.py' }, 'running')), 'Reading models.py')
  assert.equal(doing(tool({ type: 'shell', command: 'npm test\necho done' })), 'Running npm test')
  assert.equal(doing(tool({ type: 'unknown', input: { path: 'src/x.ts' }, output: null }, 'running', 'read')), 'Reading x.ts')
  assert.equal(doing(tool({ type: 'plan', text: '' }, 'running', 'ExitPlanMode')), 'Running ExitPlanMode')
  assert.equal(doing(thought), 'Thinking')
})

test('sums up what the steps did, files counted once', () => {
  const steps = [
    thought,
    tool({ type: 'shell', command: 'ls' }),
    tool({ type: 'read', filePath: 'a' }),
    tool({ type: 'read', filePath: 'a' }),
    tool({ type: 'read', filePath: 'b' }),
    tool({ type: 'shell', command: 'false' }, 'failed'),
    tool({ type: 'edit', filePath: 'a' }),
  ]
  assert.deepEqual(summary(steps), { text: 'Thought, ran 2 commands, read 2 files, edited a file', failed: 1 })
  assert.deepEqual(summary([thought]), { text: 'Thought', failed: 0 })
})
