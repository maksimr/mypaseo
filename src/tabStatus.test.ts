import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agent } from './daemon.ts'
import { tabBadge, tabTitle } from './tabStatus.ts'

const agent = (a: Partial<Agent>) => ({ status: 'idle', pendingPermissions: [], requiresAttention: false, ...a }) as Agent

test('title counts agents needing attention and falls back to the app name', () => {
  const unread = [agent({ requiresAttention: true }), agent({ pendingPermissions: [{}] as Agent['pendingPermissions'] }), agent({})]
  assert.equal(tabTitle('Fix login', unread), '(2) Fix login · mypaseo')
  assert.equal(tabTitle(undefined, []), 'mypaseo')
})

test('badge prefers running over needs attention', () => {
  assert.equal(tabBadge([agent({ requiresAttention: true }), agent({ status: 'running' })]), '#f59e0b')
  assert.equal(tabBadge([agent({ requiresAttention: true })]), '#22c55e')
  assert.equal(tabBadge([agent({})]), null)
})
