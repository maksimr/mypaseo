import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mentionSpans, mentions } from './mentions.ts'

const handles = ['agent', 'code-reviewer', 'code-reviewer-2']

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

test('unique, first-seen order; code spans and fences close properly', () => {
  assert.deepEqual(mentions('@code-reviewer and @agent, again @AGENT and @code-reviewer', handles), ['code-reviewer', 'agent'])
  assert.deepEqual(mentions('``a ` @agent`` then @code-reviewer', handles), ['code-reviewer'])
  assert.deepEqual(mentions('~~~~\n@agent\n~~~\n@code-reviewer\n~~~~\n@agent', handles), ['agent'])
  assert.deepEqual(mentions('```\n@agent never closed', handles), [])
  assert.deepEqual(mentions('a stray ` then @agent', handles), ['agent'])
  assert.deepEqual(mentions('``x` @agent`', handles), []) // `` has no closing ``, then ` @agent` is a span
  assert.deepEqual(mentions('é@agent _@agent -@agent @@agent x/@agent @agent-', handles), [])
  assert.deepEqual(mentions('hi\n@agent: done!@code-reviewer', handles), ['agent', 'code-reviewer'])
})

test('spans: every mention where it stands, past code', () => {
  assert.deepEqual(mentionSpans('```\n@agent\n```\n`@agent` @Agent, @code-reviewer @agent @nobody', handles), [
    { handle: 'agent', start: 24, end: 30 },
    { handle: 'code-reviewer', start: 32, end: 46 },
    { handle: 'agent', start: 47, end: 53 },
  ])
})
