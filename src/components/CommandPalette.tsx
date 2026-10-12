import { Search } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useEscape } from '../a11y'
import { SHORTCUTS, SHORTCUT_IDS, binding, formatCombo, keysOf, pauseShortcuts, type ShortcutId } from '../keymap'

// Only the composer or commit dialog handles these, and Add to Chat needs the selection the palette's input takes.
const HIDDEN: ShortcutId[] = ['commandPalette', 'send', 'cycleThinking', 'pickModel', 'pickProject', 'amend', 'addToChat']

/** Lists the shortcut commands. Running one replays its key combo on window, so whichever component owns it handles it. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  useEffect(() => {
    pauseShortcuts(true)
    return () => pauseShortcuts(false)
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
        <label className="search">
          <Search size={14} />
          <input
            autoFocus
            role="combobox"
            aria-label="Command"
            aria-autocomplete="list"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={ids.length ? `${listId}-${selected}` : undefined}
            placeholder="Run a command…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || !ids.length) return
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSel((selected + (e.key === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length)
              else if (e.key === 'Enter') run(ids[selected])
              else return
              e.preventDefault()
            }}
          />
        </label>
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
