import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { errorText } from '../daemon'
import { SHORTCUTS, SHORTCUT_IDS, binding, comboOf, formatCombo, keysOf, pauseShortcuts, type ShortcutId } from '../keymap'
import { OpenFileContext } from '../openFile'
import { useDaemon } from '../store'

// Only the composer or commit dialog handles these, and Add to Chat needs the selection the palette's input takes.
const HIDDEN: ShortcutId[] = ['commandPalette', 'send', 'cycleThinking', 'pickModel', 'pickProject', 'amend', 'addToChat']

/**
 * Lists the shortcut commands. Running one replays its key combo on window, so whichever component owns it handles it.
 * A query starting with `@` searches the workspace's files instead and opens the picked one.
 */
export function CommandPalette({ cwd, onClose }: { cwd?: string; onClose: () => void }) {
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
  const q = query.trim()
  const fileQuery = q.startsWith('@') ? q.slice(1) : undefined

  const daemon = useDaemon()
  const openFile = useContext(OpenFileContext)
  const [files, setFiles] = useState<string[] | string>()
  useEffect(() => {
    if (fileQuery === undefined || !cwd) return
    let alive = true
    const timer = setTimeout(() => {
      daemon.getDirectorySuggestions({ cwd, query: fileQuery, limit: 50, includeFiles: true, includeDirectories: false }).then(
        (r) => alive && setFiles(r.error ?? r.entries.map((e) => e.path)),
        (e) => alive && setFiles(errorText(e)),
      )
    }, 180) // debounce typing, like the composer's @ autocomplete
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [daemon, fileQuery, cwd])

  const items =
    fileQuery === undefined
      ? SHORTCUT_IDS.filter((id) => !HIDDEN.includes(id) && SHORTCUTS[id].label.toLowerCase().includes(q.toLowerCase())).map((id) => ({
          key: id,
          label: SHORTCUTS[id].label,
          hint: formatCombo(binding(id)),
          title: SHORTCUTS[id].description,
          run: () => {
            onClose()
            pauseShortcuts(false) // the palette unmounts after the replayed combo runs
            window.dispatchEvent(new KeyboardEvent('keydown', { ...keysOf(binding(id)), cancelable: true }))
          },
        }))
      : cwd && Array.isArray(files)
        ? files.map((path) => ({
            key: path,
            label: path,
            hint: undefined,
            title: path,
            run: () => {
              onClose()
              openFile(path)
            },
          }))
        : []
  const status =
    fileQuery === undefined ? 'No matching commands' : !cwd ? 'No workspace open' : typeof files === 'string' ? files : !files ? 'Loading…' : 'No matching files'
  const selected = Math.min(sel, items.length - 1)

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
          aria-activedescendant={items.length ? `${listId}-${selected}` : undefined}
          placeholder="Execute a command, or @ to search files…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || !items.length) return
            // Ctrl+N/P like Emacs and Zed; physical keys, like the keymap.
            const keys = comboOf(e)
            const step = keys === 'ArrowDown' || keys === 'Ctrl+KeyN' ? 1 : keys === 'ArrowUp' || keys === 'Ctrl+KeyP' ? -1 : 0
            if (step) setSel((selected + step + items.length) % items.length)
            else if (e.key === 'Enter') items[selected].run()
            else return
            e.preventDefault()
          }}
        />
        <div className="palette-list" id={listId} role="listbox" aria-label={fileQuery === undefined ? 'Commands' : 'Files'}>
          {items.length === 0 && <div className="autocomplete-status">{status}</div>}
          {items.map((item, i) => (
            <div
              key={item.key}
              id={`${listId}-${i}`}
              ref={i === selected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              className="autocomplete-item"
              role="option"
              aria-selected={i === selected}
              title={item.title}
              onClick={item.run}
            >
              <span className="grow truncate">{item.label}</span>
              {item.hint && <span className="autocomplete-hint">{item.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
