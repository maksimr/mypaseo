import { Folder, X } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { errorText } from '../../daemon'
import { useEscape } from '../../a11y'
import { client, hostLabel, useHostId, useStore } from '../../store'
import { FolderAdd } from '../../components/icons'

/** Asks for a project directory; a failed add keeps the dialog open so the path can be fixed. */
export function AddProjectDialog({ onClose }: { onClose: () => void }) {
  const { hosts } = useStore()
  const contextHost = useHostId()
  const [hostId, setHostId] = useState(contextHost)
  const [cwd, setCwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  const [closedFor, setClosedFor] = useState<string>() // a pick or Escape hides the list until the path changes
  const listId = useId()
  useEscape(onClose)

  const query = cwd.trim()
  useEffect(() => {
    if (!query) return
    let alive = true
    const timer = setTimeout(() => {
      // The daemon matches fuzzily under the home dir and returns absolute paths; failures just leave the list as is.
      client(hostId).getDirectorySuggestions({ query, limit: 30, includeDirectories: true }).then(
        (r) => alive && setSuggestions(r.entries.map((e) => e.path)),
        () => {},
      )
    }, 180) // debounce typing
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, hostId])
  const open = !!query && cwd !== closedFor && suggestions.length > 0
  const selected = Math.min(sel, suggestions.length - 1)
  const edit = (path: string) => (setCwd(path), setSel(0))
  const pick = (path: string) => (edit(path), setClosedFor(path))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await client(hostId).addProject(cwd.trim())
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog narrow" role="dialog" aria-label="Add Project" onSubmit={submit}>
        <header className="dialog-head">
          <span className="muted">
            <FolderAdd />
          </span>
          <h2 className="grow">Add Project</h2>
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-toolbar">
          {hosts.length > 1 && (
            <select className="input select" name="host" aria-label="Host" value={hostId} onChange={(e) => setHostId(e.target.value)}>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {hostLabel(h.id)}
                </option>
              ))}
            </select>
          )}
          <div className="path-field grow">
            <input
              autoFocus
              className="input mono"
              name="cwd"
              role="combobox"
              aria-label="Project Directory"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={open ? `${listId}-${selected}` : undefined}
              placeholder="/absolute/path/to/project"
              autoComplete="off"
              spellCheck={false}
              value={cwd}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (!open || e.nativeEvent.isComposing) return
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSel((selected + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
                else if (e.key === 'Enter') pick(suggestions[selected])
                // Shell-style: Tab completes into the directory to keep drilling down.
                else if (e.key === 'Tab' && !e.shiftKey) edit(suggestions[selected].replace(/\/?$/, '/'))
                else if (e.key === 'Escape') {
                  e.stopPropagation() // closes the list, not the dialog
                  setClosedFor(cwd)
                } else return
                e.preventDefault()
              }}
            />
            {open && (
              // preventDefault keeps focus in the input.
              <div className="autocomplete below" id={listId} role="listbox" aria-label="Directories" onMouseDown={(e) => e.preventDefault()}>
                {suggestions.map((path, i) => (
                  <div
                    key={path}
                    id={`${listId}-${i}`}
                    ref={i === selected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    className="autocomplete-item"
                    role="option"
                    aria-selected={i === selected}
                    onClick={() => pick(path)}
                  >
                    <Folder size={14} className="muted" />
                    <span className="autocomplete-label">{path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="dialog-note muted">A directory on the daemon's machine. Type any part to search.</p>
        {error && <div className="banner err">{error}</div>}
        <footer className="dialog-actions">
          <button type="button" className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <button className="btn primary" disabled={busy || !cwd.trim()}>
            {busy && <Spinner size={13} />} Add Project
          </button>
        </footer>
      </form>
    </div>
  )
}
