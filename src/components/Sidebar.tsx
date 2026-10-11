import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  GitBranch,
  Import,
  ListFilter,
  Loader2,
  Plus,
  Server,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type MouseEvent } from 'react'
import { errorText, type Agent, type Project, type Workspace } from '../daemon'
import { clickable, useEscape } from '../a11y'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { byRecent, client, hostLabel, projectWorkspaces as sortedWorkspaces, sidebarWorkspaces, useHostId, useStore } from '../store'
import { AddHostDialog, HostMenu } from './Hosts'
import { ProviderIcon } from './ProviderIcon'

export type Selection = { projectId?: string; workspaceId?: string; agentId?: string }

/** Open folder with a slanted, grey front flap. */
const FolderExpanded = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 10V8a2 2 0 0 0-2-2h-5.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2" />
    <path d="M4 20l2.3-8.5A2 2 0 0 1 8.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5Z" fill="currentColor" fillOpacity={0.3} />
  </svg>
)

/** Folder outline with a plus at its bottom-right corner (lucide's FolderPlus puts the plus inside). */
const FolderAdd = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v3.5M16 19h6M19 16v6" />
  </svg>
)

/** onClick for a popover menu trigger: keeps the row from activating and puts the menu under (or above) the trigger. */
const placeMenu = (menuId: string, above = false) => (e: MouseEvent<HTMLElement>) => {
  e.stopPropagation()
  // shortcut: fixed placement at the trigger, no edge flipping; switch to CSS anchor positioning once Baseline.
  const r = e.currentTarget.getBoundingClientRect()
  const menu = document.getElementById(menuId)!
  menu.style.top = above ? '' : `${r.bottom + 4}px`
  menu.style.bottom = above ? `${innerHeight - r.top + 4}px` : ''
  menu.style.left = `${r.left}px`
}

export function Sidebar({
  selection,
  onSelect,
  onArchive,
  onOpenSettings,
  onOpenHost,
  onImport,
  activeOnly,
  onToggleActiveOnly,
}: {
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
  onOpenSettings: () => void
  onOpenHost: (hostId: string) => void
  onImport: (projectId: string) => void
  activeOnly: boolean
  onToggleActiveOnly: () => void
}) {
  const { hosts, byHost, projects, workspaces, agents } = useStore()
  // The footer shows the first host that isn't connected.
  const down = hosts.find((h) => byHost[h.id]?.status !== 'connected')
  const downState = down && byHost[down.id]
  const [addingHost, setAddingHost] = useState(false)
  const settingsKey = useShortcut('openSettings')
  const newWorkspaceKey = useShortcut('newWorkspace')
  const addProjectKey = useShortcut('addProject')
  const activeOnlyKey = useShortcut('toggleActiveOnly')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.mypaseoCollapsed ?? '[]')))
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(id)) next.add(id)
      localStorage.mypaseoCollapsed = JSON.stringify([...next])
      return next
    })

  const [adding, setAdding] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'addProject')) return
      e.preventDefault()
      setAdding(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const removeProject = async (p: Project, name: string) => {
    if (!confirm(`Remove project "${name}"? Its agents are archived; files on disk are kept.`)) return
    try {
      await client(p.hostId).removeProject(p.projectId)
    } catch (e) {
      alert(`Could not remove project: ${errorText(e)}`)
    }
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="section-label">Projects</span>
          <button className="icon-btn hover-only" title={`Add Project (${formatCombo(addProjectKey)})`} onClick={() => setAdding(true)}>
            <FolderAdd />
          </button>
          <button
            className={`icon-btn ${activeOnly ? 'on' : 'hover-only'}`}
            title={`Show Only Active Workspaces (${formatCombo(activeOnlyKey)})`}
            aria-pressed={activeOnly}
            onClick={onToggleActiveOnly}
          >
            <ListFilter size={15} />
          </button>
        </div>
        <nav className="tree">
          {projects.length === 0 && <div className="empty">{down ? 'Connecting…' : 'No projects yet'}</div>}
          {projects.map((p) => {
            const open = !collapsed.has(p.projectId)
            const projectWorkspaces = sortedWorkspaces(p.projectId, workspaces, agents)
            const shownWorkspaces = sidebarWorkspaces([p], workspaces, agents, activeOnly, selection.workspaceId)
            if (activeOnly && shownWorkspaces.length === 0) return null
            const name = p.projectCustomName || p.projectDisplayName
            const menuId = `project-menu-${p.projectId}`
            return (
              <div key={p.projectId}>
                <div
                  className="row project"
                  aria-expanded={open}
                  {...clickable(() => toggle(p.projectId))}
                >
                  {open ? <FolderExpanded /> : <Folder size={15} />}
                  <span className="truncate">{name}</span>
                  <span className="chevron hover-only">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                  <span className="grow" />
                  {hosts.length > 1 && <span className="host-badge muted truncate">{hostLabel(p.hostId)}</span>}
                  <button
                    className="icon-btn hover-swap"
                    title="Project Actions"
                    popoverTarget={menuId}
                    onClick={placeMenu(menuId)}
                  >
                    <Ellipsis size={13} />
                  </button>
                  <button
                    className="icon-btn hover-swap"
                    title={`New Workspace (${formatCombo(newWorkspaceKey)})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect({ projectId: p.projectId })
                    }}
                  >
                    <Plus size={13} />
                  </button>
                  <StatusMark agents={agents.filter((a) => projectWorkspaces.some((w) => w.id === a.workspaceId))} />
                </div>
                <div id={menuId} popover="auto" className="menu">
                  <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => onImport(p.projectId)}>
                    <Import size={14} /> Import Session
                  </button>
                  <button
                    className="danger"
                    popoverTarget={menuId}
                    popoverTargetAction="hide"
                    onClick={() => removeProject(p, name)}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
                {open &&
                  shownWorkspaces.map((w) => (
                    <WorkspaceRow
                      key={w.id}
                      workspace={w}
                      agents={agents.filter((a) => a.workspaceId === w.id).sort(byRecent)}
                      collapsed={collapsed.has(w.id)}
                      onToggle={() => toggle(w.id)}
                      selection={selection}
                      onSelect={onSelect}
                      onArchive={onArchive}
                    />
                  ))}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <button className="icon-btn" title="Hosts" popoverTarget="host-menu" onClick={placeMenu('host-menu', true)}>
            <Server size={15} />
          </button>
          <span className={`dot ${downState?.status ?? 'connected'}`} />
          <span className="muted grow truncate">
            {downState ? `${hosts.length > 1 ? `${hostLabel(down.id)}: ` : ''}${downState.error ?? downState.status}` : 'Connected'}
          </span>
          <button className="icon-btn" title={`Settings (${formatCombo(settingsKey)})`} onClick={onOpenSettings}>
            <Settings size={15} />
          </button>
        </div>
      </aside>
      <HostMenu id="host-menu" onOpenHost={onOpenHost} onAdd={() => setAddingHost(true)} />
      {/* Outside the aside: a hidden sidebar is display: none. */}
      {adding && <AddProjectDialog onClose={() => setAdding(false)} />}
      {addingHost && <AddHostDialog onClose={() => setAddingHost(false)} />}
    </>
  )
}

/** Asks for a project directory; a failed add keeps the dialog open so the path can be fixed. */
function AddProjectDialog({ onClose }: { onClose: () => void }) {
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
            {busy && <Loader2 size={13} className="spin" />} Add Project
          </button>
        </footer>
      </form>
    </div>
  )
}

function WorkspaceRow({
  workspace: w,
  agents,
  collapsed: userCollapsed,
  onToggle,
  selection,
  onSelect,
  onArchive,
}: {
  workspace: Workspace
  agents: Agent[]
  collapsed: boolean
  onToggle: () => void
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
}) {
  // A lone agent folds into its workspace row: the row already opens it.
  const collapsed = userCollapsed || agents.length < 2
  // A collapsed workspace hides its agents, so it shows their selection itself.
  const active = selection.workspaceId === w.id && (!selection.agentId || collapsed)
  const select = (agentId?: string) => onSelect({ projectId: w.projectId, workspaceId: w.id, agentId })
  const name = w.title || w.name
  // An untitled workspace is already named after its branch.
  const branch = w.gitRuntime?.currentBranch !== name ? w.gitRuntime?.currentBranch : undefined
  const menuId = `workspace-menu-${w.id}`
  const archiveKey = useShortcut('archiveWorkspace')
  const archive = (deleteAgents: boolean) => onArchive(w, deleteAgents)
  const [syncing, setSyncing] = useState<'pull' | 'push'>()
  const sync = async (op: 'pull' | 'push') => {
    setSyncing(op)
    try {
      const daemon = client(w.hostId)
      const r = await (op === 'pull' ? daemon.checkoutPull(w.workspaceDirectory) : daemon.checkoutPush(w.workspaceDirectory))
      if (r.error) throw new Error(r.error.message)
    } catch (e) {
      alert(`Could not ${op}: ${errorText(e)}`)
    }
    setSyncing(undefined)
  }

  return (
    <>
      <div className={`row workspace ${active ? 'active' : ''}`} {...clickable(() => select(agents[0]?.id))}>
        {agents.length > 1 ? (
          <button
            className="chevron"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="chevron" />
        )}
        <span className="workspace-label">
          <span className="truncate">{name}</span>
          {branch && (
            <span className="workspace-branch muted">
              <GitBranch size={11} aria-label="Branch" />
              <span className="truncate">{branch}</span>
            </span>
          )}
        </span>
        <button className="icon-btn hover-swap" title="Workspace Actions" popoverTarget={menuId} onClick={placeMenu(menuId)}>
          <Ellipsis size={13} />
        </button>
        <button
          className="icon-btn hover-swap"
          title={`Archive (${formatCombo(archiveKey)})`}
          onClick={(e) => {
            e.stopPropagation()
            archive(false)
          }}
        >
          <Archive size={11} strokeWidth={1.75} />
        </button>
        {syncing ? (
          <Loader2 size={13} className="spin muted status-mark" aria-label={syncing === 'pull' ? 'Pulling…' : 'Pushing…'} />
        ) : (
          <StatusMark agents={agents} />
        )}
      </div>
      <div id={menuId} popover="auto" className="menu">
        <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => select()}>
          <Plus size={14} /> New Agent
        </button>
        {w.projectKind === 'git' && (
          <>
            <button popoverTarget={menuId} popoverTargetAction="hide" disabled={!!syncing} onClick={() => void sync('pull')}>
              <ArrowDownToLine size={14} /> Pull
            </button>
            <button popoverTarget={menuId} popoverTargetAction="hide" disabled={!!syncing} onClick={() => void sync('push')}>
              <ArrowUpFromLine size={14} /> Push
            </button>
          </>
        )}
        <button className="danger" popoverTarget={menuId} popoverTargetAction="hide" onClick={() => archive(true)}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
      {!collapsed &&
        agents.map((a) => (
          <div
            key={a.id}
            className={`row agent ${selection.agentId === a.id ? 'active' : ''}`}
            {...clickable(() => select(a.id))}
          >
            <ProviderIcon provider={a.provider} size={9} />
            <span className="grow truncate">{a.title || 'New agent'}</span>
            <StatusMark agents={[a]} />
          </div>
        ))}
    </>
  )
}

/** Derived from agents: the daemon's workspace status can lag behind them. */
function StatusMark({ agents }: { agents: Agent[] }) {
  if (agents.some((a) => a.status === 'running'))
    return <Loader2 size={13} className="spin muted status-mark" aria-label="Running" />
  if (agents.some((a) => a.pendingPermissions.length > 0 || a.requiresAttention))
    return <span className="dot attention status-mark" title="Needs attention" />
  if (agents.some((a) => a.status === 'error')) return <span className="dot failed status-mark" title="Error" />
  return null
}
