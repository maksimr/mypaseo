import { GitBranch, Loader2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { errorText, type Workspace } from '../daemon'
import { useEscape } from '../a11y'
import { client } from '../store'

/** Sets the workspace's title and renames its branch; an empty title goes back to the branch or folder name. */
export function RenameWorkspaceDialog({ workspace: w, onClose }: { workspace: Workspace; onClose: () => void }) {
  const current = w.title || w.name
  const currentBranch = w.gitRuntime?.currentBranch // none when detached or not git: nothing to rename
  const [title, setTitle] = useState(current)
  const [branch, setBranch] = useState(currentBranch ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEscape(onClose)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const newBranch = branch.trim()
    const renameBranch = !!currentBranch && newBranch !== currentBranch
    // The daemon keeps naming an untitled workspace after the branch it was created on, so a name that showed the branch follows its rename.
    const newTitle = renameBranch && title.trim() === current && current === currentBranch ? newBranch : title
    if (!renameBranch && newTitle.trim() === current) return onClose()
    setBusy(true)
    setError(null)
    try {
      const daemon = client(w.hostId)
      if (renameBranch) {
        // The daemon validates the name and reports a bad one here.
        const { error } = await daemon.renameBranch({ cwd: w.workspaceDirectory, branch: newBranch })
        if (error) throw new Error(error.message)
      }
      // The daemon trims it, and an empty title clears the override.
      if (newTitle.trim() !== current) await daemon.setWorkspaceTitle(w.id, newTitle)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog narrow" role="dialog" aria-label="Rename Workspace" onSubmit={submit}>
        <header className="dialog-head">
          <h2 className="grow">Rename Workspace</h2>
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <p className="dialog-note muted">Leave empty to use the branch or folder name.</p>
        <div className="dialog-toolbar stack">
          <input
            autoFocus
            className="input"
            name="title"
            aria-label="Workspace name"
            placeholder="Branch or folder name"
            autoComplete="off"
            spellCheck={false}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          {currentBranch && (
            <label className="search">
              <GitBranch size={14} aria-hidden />
              <input
                className="mono"
                name="branch"
                aria-label="Branch name"
                autoComplete="off"
                spellCheck={false}
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </label>
          )}
        </div>
        {error && <div className="banner err">{error}</div>}
        <footer className="dialog-actions">
          <button type="button" className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy && <Loader2 size={13} className="spin" />} Rename
          </button>
        </footer>
      </form>
    </div>
  )
}
