import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toWsUrl } from './hostUrl.ts'

test('turns typed addresses into daemon WebSocket URLs', () => {
  assert.equal(toWsUrl('mac.local'), 'ws://mac.local:6767/ws')
  assert.equal(toWsUrl(' 192.168.1.5:7000 '), 'ws://192.168.1.5:7000/ws')
  assert.equal(toWsUrl('[::1]:6767'), 'ws://[::1]:6767/ws')
  assert.equal(toWsUrl('http://mac.local:6767'), 'ws://mac.local:6767/ws')
  assert.equal(toWsUrl('https://paseo.example.com'), 'wss://paseo.example.com/ws')
  assert.equal(toWsUrl('wss://paseo.example.com/custom'), 'wss://paseo.example.com/custom')
  assert.throws(() => toWsUrl('ftp://mac.local'))
  assert.throws(() => toWsUrl('not a host'))
})
