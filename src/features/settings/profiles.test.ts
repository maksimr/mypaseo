import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleError } from './profiles.ts'

test('refuses empty, reserved and taken handles, but a profile keeps its own', () => {
  const profiles = [{ id: '1', name: 'Code reviewer' }]
  assert.equal(handleError('!!', '2', profiles), 'The name needs a letter or digit.')
  assert.equal(handleError('Agent', '2', profiles), '@agent is reserved.')
  assert.equal(handleError(' user ', '2', profiles), '@user is reserved.')
  assert.equal(handleError('code-REVIEWER', '2', profiles), 'Another profile is already @code-reviewer.')
  assert.equal(handleError('Code  reviewer', '1', profiles), null)
  assert.equal(handleError('Code reviewer 2', '2', profiles), null)
})
