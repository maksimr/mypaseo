import { Eye, Folder } from 'lucide-react'
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useEscape } from '../../a11y'
import { listAllFiles, rankPaths } from '../chat/autocomplete'
import { Pick } from '../../components/Pick'
import { errorText } from '../../daemon'
import { focusView } from '../../focus'
import { SHORTCUTS, SHORTCUT_IDS, binding, comboOf, formatCombo, keysOf, pauseShortcuts, type ShortcutId } from '../../keymap'
import { OpenFileContext } from '../../openFile'
import { hostLabel, projectName, useDaemon, useStore } from '../../store'

// Only the composer or commit dialog handles these, and Add to Chat needs the selection the palette's input takes.
const HIDDEN: ShortcutId[] = ['commandPalette', 'send', 'cycleThinking', 'pickModel', 'pickProject', 'amend', 'addToChat', 'listSearch']

/**
 * Lists the shortcut commands. Running one replays its key combo on window, so whichever component owns it handles it.
 * A query starting with `@` searches the workspace's files instead and opens the picked one. The daemon's search skips
 * hidden and gitignored files, so with those switched on the palette lists the whole workspace once and ranks it itself.
 * The project picker opens another project's workspace behind the palette, so its files and commands act there; it is
 * unset with no workspace open, as in a New Agent composer that starts a new workspace.
 */
export function CommandPalette({
  cwd,
  projectId,
  onProject,
  onClose,
}: {
  cwd?: string
  projectId?: string
  onProject: (projectId: string) => void
  onClose: () => void
}) {
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
      // Picking a project unmounts the old workspace's views: the new one's open tab takes the focus instead.
      if (prev?.isConnected) prev.focus()
      else focusView(document.body)
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
  const [hidden, setHidden] = useState(() => localStorage.mypaseoPaletteHidden === 'on')
  const [allFiles, setAllFiles] = useState<string[] | string>()
  // Results belong to the workspace they came from: picking another project drops them.
  const [filesCwd, setFilesCwd] = useState(cwd)
  if (filesCwd !== cwd) {
    setFilesCwd(cwd)
    setFiles(undefined)
    setAllFiles(undefined)
  }
  const { projects, hosts } = useStore()
  const listAll = hidden && fileQuery !== undefined && !!cwd && allFiles === undefined
  useEffect(() => {
    if (!listAll) return
    let alive = true
    listAllFiles((dir) => daemon.listDirectory(cwd, dir).then((r) => r.entries)).then(
      (r) => alive && setAllFiles(r),
      (e) => alive && setAllFiles(errorText(e)),
    )
    return () => {
      alive = false
    }
  }, [daemon, cwd, listAll])
  const shown = !hidden ? files : Array.isArray(allFiles) ? rankPaths(allFiles, fileQuery ?? '', 50) : allFiles
  useEffect(() => {
    if (fileQuery === undefined || !cwd || hidden) return
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
  }, [daemon, fileQuery, cwd, hidden])

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
      : cwd && Array.isArray(shown)
        ? shown.map((path) => ({
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
    fileQuery === undefined ? 'No matching commands' : !cwd ? 'No workspace open: pick a project' : typeof shown === 'string' ? shown : !shown ? 'Loading…' : 'No matching files'
  const selected = Math.min(sel, items.length - 1)

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-label="Command Palette">
        <div className="palette-head">
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
          {fileQuery !== undefined && (
            <button
              className={`icon-btn ${hidden ? 'on' : ''}`}
              title="Include Hidden and Ignored Files"
              aria-pressed={hidden}
              onMouseDown={(e) => e.preventDefault()} // keep typing in the input
              onClick={() => {
                localStorage.mypaseoPaletteHidden = hidden ? 'off' : 'on'
                setHidden(!hidden)
                setSel(0)
              }}
            >
              <Eye size={15} />
            </button>
          )}
          <Pick
            icon={<Folder size={14} />}
            value={projectId}
            onChange={(id) => {
              onProject(id)
              setSel(0)
              input.current?.focus() // keep typing in the input
            }}
            options={projects.map((p) => [p.projectId, `${projectName(p)}${hosts.length > 1 ? ` · ${hostLabel(p.hostId)}` : ''}`])}
            title="Project"
          />
        </div>
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
