import { Check, ChevronDown, GitBranch } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEscape } from '../a11y'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { useDaemon } from '../store'

/** Zed-style commit modal: an empty message makes the daemon generate one, an empty amend keeps the last one. */
export type CommitInput = { message: string; amend: boolean; signoff: boolean; noVerify: boolean }

export function CommitDialog({
  cwd,
  failed,
  onClose,
  onCommit,
}: {
  cwd: string
  failed: { input: CommitInput; error: string } | null
  onClose: () => void
  onCommit: (input: CommitInput) => void
}) {
  const [message, setMessage] = useState(failed?.input.message ?? '')
  const [signoff, setSignoff] = useState(failed?.input.signoff ?? false)
  const [noVerify, setNoVerify] = useState(failed?.input.noVerify ?? false)
  const daemon = useDaemon()
  const [branch, setBranch] = useState<string | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const commitKey = useShortcut('commit')
  const amendKey = useShortcut('amend')
  // Esc with the menu open closes just the menu, not the dialog and its message.
  useEscape(() => !menu.current?.matches(':popover-open') && onClose())

  useEffect(() => {
    let live = true
    daemon.getCheckoutStatus(cwd).then(
      (s) => live && setBranch(s.currentBranch ?? null),
      () => {},
    )
    return () => {
      live = false
    }
  }, [daemon, cwd])

  const commit = (amend: boolean) => onCommit({ message, amend, signoff, noVerify })

  const toggle = (label: string, on: boolean, set: (on: boolean) => void) => (
    <button role="menuitemcheckbox" aria-checked={on} popoverTarget="commit-menu" popoverTargetAction="hide" onClick={() => set(!on)}>
      <Check size={14} style={{ visibility: on ? 'visible' : 'hidden' }} /> {label}
    </button>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="commit-dialog"
        role="dialog"
        aria-label="Commit"
        onKeyDown={(e) => {
          const amend = isShortcut(e, 'amend')
          if (!amend && !isShortcut(e, 'commit')) return
          e.preventDefault()
          commit(amend)
        }}
      >
        <textarea
          autoFocus
          className="commit-message"
          rows={2}
          aria-label="Commit Message"
          placeholder="Enter commit message (leave empty to generate one)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {failed && <div className="commit-error err pre-wrap">{failed.error}</div>}
        <footer className="commit-foot">
          {branch && (
            <span className="commit-branch muted truncate">
              <GitBranch size={14} /> {branch}
            </span>
          )}
          <span className="grow" />
          <button className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <div className="split-btn">
            <button title={`Commit (${formatCombo(commitKey)})`} onClick={() => commit(false)}>
              Commit
            </button>
            <button
              title="Commit Options"
              popoverTarget="commit-menu"
              onClick={(e) => {
                // shortcut: fixed placement under the trigger, like Sidebar's menus; switch to CSS anchor positioning once Baseline.
                const r = e.currentTarget.getBoundingClientRect()
                menu.current!.style.top = `${r.bottom + 4}px`
                menu.current!.style.right = `${innerWidth - r.right}px`
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </footer>
        <div id="commit-menu" ref={menu} popover="auto" className="menu" role="menu">
          <button role="menuitem" popoverTarget="commit-menu" popoverTargetAction="hide" onClick={() => commit(true)}>
            <Check size={14} style={{ visibility: 'hidden' }} />
            <span className="grow">Amend</span>
            <kbd>{formatCombo(amendKey)}</kbd>
          </button>
          {toggle('Signoff', signoff, setSignoff)}
          {toggle('Skip Hooks', noVerify, setNoVerify)}
        </div>
      </div>
    </div>
  )
}
