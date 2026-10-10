import assert from 'node:assert/strict'
import { test } from 'node:test'

const storage: Record<string, string> = {}
Object.assign(globalThis, { localStorage: storage })
// Mac defaults use Meta, the case most likely to get the modifier order wrong.
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mac' } })
const { SHORTCUTS, binding, comboOf, formatCombo, isShortcut, setShortcut } = await import('./keymap.ts')

const press = (code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods })

test('combos use physical keys in a fixed modifier order', () => {
  assert.equal(comboOf(press('KeyB', { metaKey: true, shiftKey: true, ctrlKey: true })), 'Ctrl+Shift+Meta+KeyB')
  assert.equal(formatCombo('Ctrl+Shift+Meta+KeyB', true), '⌃⇧⌘B')
  assert.equal(formatCombo('Ctrl+Digit1', false), 'Ctrl+1')
  assert.equal(formatCombo('Meta+Comma', true), '⌘,')
  assert.equal(formatCombo('Alt+ArrowDown', false), 'Alt+↓')
  assert.equal(formatCombo('Ctrl+Meta+Backspace', true), '⌃⌘⌫')
})

test('defaults use the modifier order comboOf produces, or they never match', () => {
  for (const { default: combo } of Object.values(SHORTCUTS)) assert.match(combo, /^(Ctrl\+)?(Alt\+)?(Shift\+)?(Meta\+)?[^+]+$/)
})

test('remapping persists and reset restores the default', () => {
  const initial = binding('send')
  setShortcut('send', 'Enter')
  assert.ok(isShortcut(press('Enter'), 'send'))
  assert.equal(storage.mypaseoKeymap, '{"send":"Enter"}')
  setShortcut('send')
  assert.equal(binding('send'), initial)
  assert.equal(storage.mypaseoKeymap, '{}')
})
