import { File, Folder } from 'lucide-react'
import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { activeTrigger, completion, rankCommands } from './autocomplete'
import { daemon, errorText, type DraftConfig, type SlashCommand } from './daemon'

type Option = { id: string; label: string; value: string; kind: 'command' | 'file' | 'directory'; hint?: string; description?: string }
type Entry = { path: string; kind: 'file' | 'directory' }

/** `/` command and `@` file autocomplete for the composer textarea, like the desktop app. */
export function useAutocomplete({
  input,
  text,
  setText,
  cwd,
  agentId,
  draftConfig,
}: {
  input: RefObject<HTMLTextAreaElement | null>
  text: string
  setText: (text: string) => void
  cwd: string
  agentId?: string
  /** Lists commands before the agent exists. No agent and no config: no command list. */
  draftConfig?: DraftConfig
}) {
  const listId = useId()
  const [cursor, setCursor] = useState(0)
  const [closedAt, setClosedAt] = useState<number>()
  const [sel, setSel] = useState({ key: '', i: 0 })
  const [commands, setCommands] = useState<{ key: string; list: SlashCommand[] | string }>()
  const [files, setFiles] = useState<Entry[] | string>()

  const found = activeTrigger(text, cursor)
  // Escape closes the popup until that trigger is gone.
  if (!found && closedAt !== undefined) setClosedAt(undefined)
  const trigger = found && found.start !== closedAt ? found : null

  const commandsKey = agentId ?? (draftConfig && JSON.stringify(draftConfig))
  const cmds = commands && commands.key === commandsKey ? commands.list : undefined
  const fetchCommands = trigger?.kind === '/' && commandsKey !== undefined && !cmds
  useEffect(() => {
    if (!fetchCommands) return
    // A draft has no agent: the daemon lists commands from draftConfig for an id it does not know.
    daemon.listCommands({ agentId: agentId ?? 'draft', draftConfig }).then(
      (r) => setCommands({ key: commandsKey, list: r.error ?? r.commands }),
      (e) => setCommands({ key: commandsKey, list: errorText(e) }),
    )
  }, [fetchCommands, commandsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fileQuery = trigger?.kind === '@' ? trigger.query : undefined
  useEffect(() => {
    if (fileQuery === undefined) return
    let alive = true
    const timer = setTimeout(() => {
      daemon.getDirectorySuggestions({ cwd, query: fileQuery, limit: 50, includeFiles: true, includeDirectories: true }).then(
        (r) => alive && setFiles(r.error ?? r.entries),
        (e) => alive && setFiles(errorText(e)),
      )
    }, 180)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [fileQuery, cwd])

  const options: Option[] =
    trigger?.kind === '/' && Array.isArray(cmds)
      ? // Mid-message only skills make sense, as in the desktop app.
        rankCommands(trigger.start ? cmds.filter((c) => c.kind === 'skill') : cmds, trigger.query).map((c) => ({
          id: c.name,
          label: `/${c.name}`,
          value: c.name,
          kind: 'command',
          hint: c.argumentHint,
          description: c.description,
        }))
      : trigger?.kind === '@' && Array.isArray(files)
        ? files.map((e) => ({ id: e.path, label: e.path, value: e.path, kind: e.kind }))
        : []
  const loaded = trigger?.kind === '/' ? cmds : files
  const status = typeof loaded === 'string' ? loaded : !loaded ? 'Loading…' : trigger?.kind === '/' ? 'No commands' : 'No files'
  const open = trigger !== null && (trigger.kind === '@' || commandsKey !== undefined)

  const selKey = trigger ? `${trigger.kind}${trigger.start}:${trigger.query}` : ''
  const selected = sel.key === selKey ? Math.min(sel.i, options.length - 1) : 0

  const pick = (o: Option) => {
    const el = input.current
    if (!el || !trigger) return
    const insert = completion(trigger, o.value, text)
    el.focus()
    el.setSelectionRange(trigger.start, trigger.end)
    // execCommand is deprecated but the only edit that lands on the native undo stack; its input event runs onChange.
    if (!document.execCommand('insertText', false, insert)) {
      el.setRangeText(insert, trigger.start, trigger.end, 'end')
      setText(el.value)
      setCursor(el.selectionStart)
    }
  }

  /** Handles the key if the popup uses it. */
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!open || !trigger) return false
    if (e.key === 'Escape') setClosedAt(trigger.start)
    else if (!options.length || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
    // The list renders bottom-up, best match next to the input.
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      setSel({ key: selKey, i: (selected + (e.key === 'ArrowUp' ? 1 : options.length - 1)) % options.length })
    else if (e.key === 'Enter' || e.key === 'Tab') pick(options[selected])
    else return false
    e.preventDefault()
    return true
  }

  const optionId = (i: number) => `${listId}-${i}`
  return {
    onKeyDown,
    /** Call on change and select so the trigger follows the caret. */
    track: (el: HTMLTextAreaElement) => setCursor(el.selectionStart),
    inputProps: {
      'aria-autocomplete': 'list' as const,
      'aria-controls': open ? listId : undefined,
      'aria-activedescendant': open && options.length ? optionId(selected) : undefined,
    },
    popup: open && trigger && (
      // preventDefault keeps focus in the textarea.
      <div className="autocomplete" id={listId} role="listbox" aria-label={trigger.kind === '/' ? 'Commands' : 'Files'} onMouseDown={(e) => e.preventDefault()}>
        {options.length === 0 && <div className="autocomplete-status">{status}</div>}
        {options.map((o, i) => (
          <div
            key={o.id}
            id={optionId(i)}
            ref={i === selected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
            className="autocomplete-item"
            role="option"
            aria-selected={i === selected}
            title={o.description}
            onClick={() => pick(o)}
          >
            {o.kind === 'directory' ? <Folder size={14} className="muted" /> : o.kind === 'file' ? <File size={14} className="muted" /> : null}
            <span className="autocomplete-label">{o.label}</span>
            {o.hint && <span className="autocomplete-hint">{o.hint}</span>}
            {o.description && <span className="muted truncate">{o.description}</span>}
          </div>
        ))}
      </div>
    ),
  }
}
