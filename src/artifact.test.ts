import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactDoc, artifactDocs, artifactTitle, fenceClosed } from './artifact.ts'

test('a fence is closed only by a fence of the same character, at least as long', () => {
  assert.equal(fenceClosed('```artifact\n<p>hi</p>\n```'), true)
  assert.equal(fenceClosed('~~~~mermaid\na-->b\n  ~~~~~ '), true)
  assert.equal(fenceClosed('```artifact\n<p>hi</p>\n``'), false)
  assert.equal(fenceClosed('```artifact\n<p>hi</p>'), false)
  assert.equal(fenceClosed('````artifact\nx\n```'), false)
  assert.equal(fenceClosed('```artifact\nx\n~~~'), false)
})

test('lists closed artifact blocks, not ones quoted in another fence or still streaming', () => {
  const F = '```'
  const text = `a\n${F}md\n${F}mermaid\nX-->Y\n${F}\n${F}mermaid\nA-->B\n${F}\n\n${F}artifact\n<p>x</p>\n${F}\n${F}artifact\n<p>open`
  assert.deepEqual(artifactDocs(text), [artifactDoc('mermaid', 'A-->B\n'), artifactDoc('artifact', '<p>x</p>\n')])
})

test('only artifact and mermaid blocks become pages; mermaid source is escaped', () => {
  assert.equal(artifactDoc('html', '<p>'), undefined)
  assert.match(artifactDoc('artifact', '<p>hi</p>')!, /^<p>hi<\/p><style>/)
  assert.match(artifactDoc('mermaid', 'A-->B & <C>')!, /<pre class="mermaid">A-->B &amp; &lt;C><\/pre>/)
})

test("a page's title names its tab; untitled pages and diagrams are Artifact", () => {
  assert.equal(artifactTitle(artifactDoc('artifact', '<head><title> Chart </title></head>')!), 'Chart')
  assert.equal(artifactTitle(artifactDoc('artifact', '<title></title><p>x</p>')!), 'Artifact')
  assert.equal(artifactTitle(artifactDoc('mermaid', 'A["<title>x</title>"]')!), 'Artifact')
})
