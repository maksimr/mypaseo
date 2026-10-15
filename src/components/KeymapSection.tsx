import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { SHORTCUTS, SHORTCUT_GROUPS, SHORTCUT_IDS, binding, comboOf, formatCombo, setShortcut, useShortcut, type ShortcutId } from '../keymap'
import { Row, anchor, matches } from './Settings'

export function Shortcuts({ q }: { q: string }) {
  const esc = matches(q, 'close dialog escape keyboard shortcuts keymap general')
  const visible = SHORTCUT_GROUPS.map(
    ([label, ids]) => [label, ids.filter((id) => matches(q, SHORTCUTS[id].label, SHORTCUTS[id].description, label, 'keyboard shortcuts keymap'))] as const,
  ).filter(([label, ids]) => ids.length || (label === 'General' && esc))
  if (!visible.length) return null
  return (
    <section className="settings-section">
      <h2>Keymap</h2>
      <div className="setting-desc keymap-hint">Click a shortcut, then press the new keys. Esc cancels.</div>
      {visible.map(([label, ids]) => (
        <div key={label} id={anchor('keymap', label)} className="settings-group">
          <div className="group-label">{label}</div>
          {ids.map((id) => (
            <ShortcutRow key={id} id={id} />
          ))}
          {label === 'General' && esc && (
            <Row title="Close Dialog" description="Close Settings and other dialogs. Can't be remapped.">
              <kbd>Esc</kbd>
            </Row>
          )}
        </div>
      ))}
    </section>
  )
}

function ShortcutRow({ id }: { id: ShortcutId }) {
  const { label, description, default: initial } = SHORTCUTS[id]
  const combo = useShortcut(id)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const record = (e: React.KeyboardEvent) => {
    if (!recording || (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey)) return // Tab still moves focus
    // Keep Esc from closing Settings and the pressed keys from triggering their current action.
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return setRecording(false)
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
    const next = comboOf(e)
    const taken = SHORTCUT_IDS.find((other) => other !== id && binding(other) === next)
    setError(taken ? `${formatCombo(next)} is already used by ${SHORTCUTS[taken].label}.` : null)
    if (taken) return
    setShortcut(id, next)
    setRecording(false)
  }

  return (
    <Row id={anchor('keymap', id)} title={label} description={error ? <span className="err">{error}</span> : description}>
      <span className="shortcut">
        <button
          className={`btn mono ${recording ? 'recording' : ''}`}
          aria-label={`Change ${label} Shortcut (${formatCombo(combo)})`}
          aria-pressed={recording}
          onClick={() => setRecording(!recording)}
          onKeyDown={record}
          onBlur={() => {
            setRecording(false)
            setError(null)
          }}
        >
          {recording ? 'Press keys…' : formatCombo(combo)}
        </button>
        {combo !== initial && (
          <button className="icon-btn" title="Reset" aria-label={`Reset ${label} Shortcut`} onClick={() => setShortcut(id)}>
            <RotateCcw size={13} />
          </button>
        )}
      </span>
    </Row>
  )
}
