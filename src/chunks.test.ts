import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { chunkKey, chunkPatch, chunks, parseHunks, restoreChunk, stagedKeys, stagedState } from './chunks.ts'

// git diff of g: 1..9 -> 5 removed, X added after 7
const gDiff = '--- a/g\n+++ b/g\n@@ -2,8 +2,8 @@\n 2\n 3\n 4\n-5\n 6\n 7\n+X\n 8\n 9\n'
const gNow = '1\n2\n3\n4\n6\n7\nX\n8\n9\n'
const g = chunks(parseHunks(gDiff)[0])

test('splits a git hunk into Zed-style change chunks', () => {
  assert.deepEqual(
    g.map((c) => [c.change, c.from, c.at, c.rows.length]),
    [[false, 1, 1, 3], [true, 4, 4, 1], [false, 5, 4, 2], [true, 7, 6, 1], [false, 7, 7, 2]],
  )
  assert.deepEqual(g[1].rows[0], { type: 'remove', content: '5', o: 5, n: '' })
})

test('derives the file checkbox state from staged chunk keys', () => {
  const hs = parseHunks(gDiff)
  assert.equal(stagedState(hs, undefined), 'none')
  assert.equal(stagedState(hs, new Set([chunkKey(g[1])])), 'some')
  assert.equal(stagedState(hs, new Set([chunkKey(g[1]), chunkKey(g[3])])), 'all')
  assert.equal(stagedState(hs, new Set()), 'some')
})

test('restores one chunk and leaves the others', () => {
  assert.equal(restoreChunk(gNow, g[1]), '1\n2\n3\n4\n5\n6\n7\nX\n8\n9\n')
  assert.equal(restoreChunk(gNow, g[3]), '1\n2\n3\n4\n6\n7\n8\n9\n')
})

test('restores lines into an emptied file', () => {
  const [c] = chunks(parseHunks('@@ -1,2 +0,0 @@\n-a\n-b')[0])
  assert.equal(restoreChunk('', c), 'a\nb\n')
})

test('refuses when the file no longer matches the diff', () => {
  assert.throws(() => restoreChunk('1\n2\n3\n4\n6\n7\nY\n8\n9\n', g[3]), /changed/)
})

test('stages and unstages single chunks with real git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunks-'))
  const git = (args: string[], input?: string) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, input, encoding: 'utf8' })
  writeFileSync(join(dir, 'g'), '1\n2\n3\n4\n5\n6\n7\n8\n9\n')
  git(['init', '-q'])
  git(['add', 'g'])
  git(['commit', '-qm', 'init'])
  writeFileSync(join(dir, 'g'), gNow)
  const cs = chunks(parseHunks(git(['diff', 'HEAD', '--', 'g']))[0])
  const staged = () => stagedKeys({ g: git(['diff', '--cached', '-U0', '--', 'g']) }).get('g')!
  const apply = (i: number, reverse = false) =>
    git(['apply', '--cached', ...(reverse ? ['--reverse'] : []), '-'], chunkPatch('g', cs, i))

  apply(3)
  assert.deepEqual([...staged()], [chunkKey(cs[3])])
  apply(1)
  assert.deepEqual(new Set(staged()), new Set([chunkKey(cs[1]), chunkKey(cs[3])]))
  apply(3, true)
  assert.deepEqual([...staged()], [chunkKey(cs[1])])
  assert.equal(git(['show', ':g']), '1\n2\n3\n4\n6\n7\n8\n9\n')
  rmSync(dir, { recursive: true })
})
