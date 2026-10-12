import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { SHORTCUTS, SHORTCUT_IDS, binding, comboOf, formatCombo, keysOf, pauseShortcuts, type ShortcutId } from '../keymap'

// Only the composer or commit dialog handles these, and Add to Chat needs the selection the palette's input takes.
const HIDDEN: ShortcutId[] = ['commandPalette', 'send', 'cycleThinking', 'pickModel', 'pickProject', 'amend', 'addToChat']

/** Lists the shortcut commands. Running one replays its key combo on window, so whichever component owns it handles it. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const input = useRef<HTMLInputElement>(null)
  // Focus moves here and back by hand, not autoFocus, so StrictMode's remount lands in the input again.
  // A layout cleanup runs before a dialog the command opens autofocuses, so that dialog keeps the focus.
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    input.current?.focus()
    pauseShortcuts(true)
    return () => {
      pauseShortcuts(false)
      prev?.focus()
    }
  }, [])
  const listId = useId()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const q = query.trim().toLowerCase()
  const ids = SHORTCUT_IDS.filter((id) => !HIDDEN.includes(id) && SHORTCUTS[id].label.toLowerCase().includes(q))
  const selected = Math.min(sel, ids.length - 1)
  const run = (id: ShortcutId) => {
    onClose()
    pauseShortcuts(false) // the palette unmounts after the replayed combo runs
    window.dispatchEvent(new KeyboardEvent('keydown', { ...keysOf(binding(id)), cancelable: true }))
  }

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-label="Command Palette">
        <input
          ref={input}
          className="palette-input"
          role="combobox"
          aria-label="Command"
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={ids.length ? `${listId}-${selected}` : undefined}
          placeholder="Execute a command…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || !ids.length) return
            // Ctrl+N/P like Emacs and Zed; physical keys, like the keymap.
            const keys = comboOf(e)
            const step = keys === 'ArrowDown' || keys === 'Ctrl+KeyN' ? 1 : keys === 'ArrowUp' || keys === 'Ctrl+KeyP' ? -1 : 0
            if (step) setSel((selected + step + ids.length) % ids.length)
            else if (e.key === 'Enter') run(ids[selected])
            else return
            e.preventDefault()
          }}
        />
        <div className="palette-list" id={listId} role="listbox" aria-label="Commands">
          {ids.length === 0 && <div className="autocomplete-status">No matching commands</div>}
          {ids.map((id, i) => (
            <div
              key={id}
              id={`${listId}-${i}`}
              ref={i === selected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              className="autocomplete-item"
              role="option"
              aria-selected={i === selected}
              title={SHORTCUTS[id].description}
              onClick={() => run(id)}
            >
              <span className="grow truncate">{SHORTCUTS[id].label}</span>
              <span className="autocomplete-hint">{formatCombo(binding(id))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
