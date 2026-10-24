import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RESERVED, slug, uniqueHandle } from './handles.ts'

test('slug lowercases and turns every run outside [a-z0-9] into one dash, trimmed', () => {
  assert.equal(slug('Code Reviewer'), 'code-reviewer')
  assert.equal(slug('  --Ä b__c! '), 'b-c')
  assert.equal(slug('GPT 5.1 (fast)'), 'gpt-5-1-fast')
  assert.equal(slug('!!'), '')
  assert.ok(RESERVED.includes(slug('Agent')) && RESERVED.includes(slug('USER')))
})

test('uniqueHandle appends -2, -3, … to a taken handle', () => {
  assert.equal(uniqueHandle('agent', []), 'agent')
  assert.equal(uniqueHandle('agent', ['agent']), 'agent-2')
  assert.equal(uniqueHandle('code-reviewer', ['code-reviewer', 'code-reviewer-2', 'agent']), 'code-reviewer-3')
  assert.equal(uniqueHandle('x', ['x-2']), 'x')
})
