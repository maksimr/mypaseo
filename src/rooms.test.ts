import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DaemonClient } from './daemon'
import { join, log, post, resume, stop } from './rooms.ts'

const fake = (invoke: (...args: unknown[]) => Promise<unknown>) => ({ invokePluginRpc: invoke }) as unknown as DaemonClient

test('each wrapper calls its mypaseo-rooms RPC', async () => {
  const calls: unknown[][] = []
  const daemon = fake(async (...args) => calls.push(args))
  const roomId = 'r'
  await join(daemon, { roomId, members: [] })
  await post(daemon, { roomId, text: 'hi', to: [], dm: false })
  await stop(daemon, { roomId })
  await resume(daemon, { roomId })
  await log(daemon, { roomId })
  assert.deepEqual(
    calls.map(([plugin, method]) => `${plugin} ${method}`),
    ['room.join', 'room.post', 'room.stop', 'room.continue', 'room.log'].map((m) => `mypaseo-rooms ${m}`),
  )
})

test('a missing plugin rejects with the install hint; other errors pass through', async () => {
  const failing = (message: string) => fake(() => Promise.reject(new Error(message)))
  await assert.rejects(log(failing('Plugin is not available: mypaseo-rooms'), { roomId: 'r' }), /needs the mypaseo-rooms daemon plugin, see the README/)
  await assert.rejects(log(failing('@x is taken in this room'), { roomId: 'r' }), /@x is taken/)
})
