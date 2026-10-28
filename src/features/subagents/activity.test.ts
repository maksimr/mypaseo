import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineItem } from '../../daemon.ts'
import { activity } from './activity.ts'

const read = (filePath: string) => ({ type: 'tool_call', callId: filePath, name: 'Read', status: 'completed', detail: { type: 'read', filePath }, error: null }) as TimelineItem
const say = (text: string) => ({ type: 'assistant_message', text }) as TimelineItem

test('the latest step, its path relative to the workspace, or the first line of the latest message', () => {
  assert.deepEqual(activity([say('Looking'), read('/repo/src/daemon.ts')], '/repo'), { verb: 'read', text: 'src/daemon.ts', file: true })
  assert.deepEqual(activity([read('/repo/a.ts'), say('\n## **Found** one `timer` issue\n\nDetails')], '/repo'), { text: 'Found one timer issue' })
  assert.deepEqual(activity([read('/elsewhere/a.ts'), say('  \n')]), { verb: 'read', text: '/elsewhere/a.ts', file: true })
  assert.equal(activity([{ type: 'user_message', text: 'Go' } as TimelineItem]), undefined)
})
