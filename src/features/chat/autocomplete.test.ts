import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeTrigger, completion, listAllFiles, mentionAt, rankCommands, rankPaths, remention, unmention } from './autocomplete.ts'

test('@ triggers anywhere, up to the cursor, and stops at whitespace or quotes', () => {
  assert.deepEqual(activeTrigger('see @src/ch', 11), { kind: '@', start: 4, end: 11, query: 'src/ch' })
  assert.deepEqual(activeTrigger('a@b@c', 5), { kind: '@', start: 3, end: 5, query: 'c' })
  assert.deepEqual(activeTrigger('@', 1), { kind: '@', start: 0, end: 1, query: '' })
  assert.equal(activeTrigger('@foo bar', 8), null)
  assert.equal(activeTrigger('"@foo" ', 7), null)
  assert.deepEqual(activeTrigger('@foo bar', 3), { kind: '@', start: 0, end: 3, query: 'fo' })
})

test('/ triggers at the start or after whitespace, never inside a path', () => {
  assert.deepEqual(activeTrigger('/rev', 4), { kind: '/', start: 0, end: 4, query: 'rev' })
  assert.deepEqual(activeTrigger('fix it /sk', 10), { kind: '/', start: 7, end: 10, query: 'sk' })
  assert.equal(activeTrigger('src/foo', 7), null)
  assert.equal(activeTrigger('/a/b', 4), null)
  assert.equal(activeTrigger('/review now', 11), null)
})

test('completion adds a trailing space only at the end of the text and quotes paths', () => {
  assert.equal(completion({ kind: '/', start: 0, end: 2, query: 'r' }, 'review', '/r'), '/review ')
  assert.equal(completion({ kind: '/', start: 0, end: 2, query: 'r' }, 'review', '/r more'), '/review')
  assert.equal(completion({ kind: '@', start: 0, end: 2, query: 'a' }, 'a "b".ts', '@a'), '"a \\"b\\".ts"')
})

test('commands rank exact, prefix, word start, substring', () => {
  const cmds = [{ name: 'paseo_tree' }, { name: 'pr-review' }, { name: 'reviewer' }, { name: 'init' }, { name: 're' }]
  assert.deepEqual(rankCommands(cmds, 'RE').map((c) => c.name), ['re', 'reviewer', 'pr-review', 'paseo_tree'])
  assert.equal(rankCommands(cmds, ''), cmds)
})

test('listAllFiles walks hidden directories, skips heavy ones and unreadable subdirectories', async () => {
  const tree: Record<string, { name: string; kind: string }[]> = {
    '.': [{ name: '.pi', kind: 'directory' }, { name: 'node_modules', kind: 'directory' }, { name: 'unreadable', kind: 'directory' }, { name: '.env', kind: 'file' }],
    '.pi': [{ name: 'settings.json', kind: 'file' }],
  }
  const list = async (dir: string) => {
    if (!tree[dir]) throw new Error(`unexpected ${dir}`)
    return tree[dir].map((e) => ({ ...e, path: dir === '.' ? e.name : `${dir}/${e.name}` }))
  }
  assert.deepEqual(await listAllFiles(list), ['.env', '.pi/settings.json'])
  await assert.rejects(listAllFiles(() => Promise.reject(new Error('down'))), /down/)
})

test('rankPaths ranks the best and shortest matches first', () => {
  assert.deepEqual(rankPaths(['src/pi.ts', '.pi/b/settings.json', '.pi/a.md', 'README.md'], '.pi/', 10), ['.pi/a.md', '.pi/b/settings.json', 'src/pi.ts'])
  assert.deepEqual(rankPaths(['b/c', 'a', 'd/e/f'], '', 2), ['a', 'b/c'])
})

test('mentionAt finds the @word around the caret', () => {
  assert.equal(mentionAt('ask @Code-Rev now', 9), 'code-rev')
  assert.equal(mentionAt('ask @code-reviewer now', 18), 'code-reviewer')
  assert.equal(mentionAt('ask @agent now', 5), 'agent')
  assert.equal(mentionAt('ask @agent now', 11), undefined)
  assert.equal(mentionAt('ask @agent now', 4), undefined)
})

test('unmention keeps the word, drops only real mentions of the handle', () => {
  assert.equal(unmention('@Agent fix it, (@agent) and @agentic or bob@agent.com', 'agent'), 'Agent fix it, (agent) and @agentic or bob@agent.com')
  assert.equal(unmention('@code-reviewer-2 and @code-reviewer.', 'code-reviewer'), '@code-reviewer-2 and code-reviewer.')
})

test('remention swaps only real mentions of the handle', () => {
  assert.equal(remention('@Agent fix it, (@agent) and @agentic or bob@agent.com', 'agent', 'critic'), '@critic fix it, (@critic) and @agentic or bob@agent.com')
})
