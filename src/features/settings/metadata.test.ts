import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProviderEntry } from '../../daemon.ts'
import { metadataKey, metadataOptions, metadataProviders } from './metadata.ts'

const preferred = { provider: 'claude', model: 'haiku', thinkingOptionId: 'off' }
const fallback = { provider: 'codex', model: 'gpt-mini', thinkingOptionId: 'low' }

test('model keys distinguish provider and model ids containing slashes', () => {
  assert.notEqual(metadataKey({ provider: 'a/b', model: 'c' }), metadataKey({ provider: 'a', model: 'b/c' }))
  const model = { provider: 'pi', model: 'openrouter/vendor/model' }
  assert.deepEqual(metadataProviders([], metadataKey(model)), [model])
})

test('changing the preferred model preserves fallbacks and clears its old thinking setting', () => {
  const saved = [preferred, fallback]
  const next = { provider: 'pi', model: 'anthropic/haiku' }
  assert.deepEqual(metadataProviders(saved, metadataKey(next)), [next, fallback])
  assert.deepEqual(saved, [preferred, fallback])
})

test('selecting the saved model keeps its thinking and other configuration', () => {
  const saved = [{ ...preferred, custom: true }, fallback]
  assert.equal(metadataProviders(saved, metadataKey(preferred)), saved)
})

test('provider defaults omit the model and Automatic clears all configured providers', () => {
  const saved = [preferred, fallback]
  assert.deepEqual(metadataProviders(saved, metadataKey({ provider: 'pi' })), [{ provider: 'pi' }, fallback])
  assert.deepEqual(metadataProviders(saved, ''), [])
  assert.deepEqual(metadataProviders([], ''), [])
})

const ready: ProviderEntry = {
  provider: 'pi', label: 'Pi', enabled: true, status: 'ready',
  models: [
    { provider: 'pi', id: 'anthropic/haiku', label: 'Haiku' },
    { provider: 'pi', id: 'hidden', label: 'Hidden', isSelectable: false },
  ],
}

test('lists defaults and selectable models grouped by ready enabled providers', () => {
  const options = metadataOptions([
    ready,
    { provider: 'codex', enabled: true, status: 'ready' },
    { ...ready, provider: 'disabled', enabled: false },
    { ...ready, provider: 'refreshing', status: 'loading' },
  ])
  assert.deepEqual(options, [
    [metadataKey({ provider: 'pi' }), 'Pi default', 'Pi'],
    [metadataKey({ provider: 'pi', model: 'anthropic/haiku' }), 'Haiku', 'Pi'],
    [metadataKey({ provider: 'codex' }), 'codex default', 'codex'],
  ])
})

test('keeps unavailable saved selections visible without changing configuration', () => {
  const selected = { provider: 'pi', model: 'missing' }
  for (const providers of [[], [ready], [{ ...ready, enabled: false }], [{ ...ready, status: 'loading' as const }]]) {
    const options = metadataOptions(providers, selected)
    const saved = options.filter(([key]) => key === metadataKey(selected))
    assert.equal(saved.length, 1)
    assert.match(saved[0][1], /pi.*missing.*unavailable/)
  }
  const available = { provider: 'pi', model: 'anthropic/haiku' }
  assert.equal(metadataOptions([ready], available).filter(([key]) => key === metadataKey(available)).length, 1)
  assert.deepEqual(metadataOptions([], { provider: 'offline' }), [
    [metadataKey({ provider: 'offline' }), 'offline · Provider default · unavailable'],
  ])
})
