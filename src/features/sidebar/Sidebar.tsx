import { ListFilter, Server, Settings } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { navigateRows } from '../../a11y'
import { errorText, type Agent, type Workspace } from '../../daemon'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import { client, hostLabel, markRead, markUnread, moveProject, scratchProject, sidebarWorkspaces, togglePin, useHostId, useStore } from '../../store'
import { unreadPick } from '../../unread'
import { AddHostDialog, HostMenu } from '../hosts/Hosts'
import { FolderAdd, ScratchAdd } from '../../components/icons'
import { placeMenu } from '../../components/menu'
import { AddProjectDialog } from './AddProjectDialog'
import { ProjectRow } from './ProjectRow'
import { RenameWorkspaceDialog } from './RenameWorkspaceDialog'

export type Selection = { projectId?: string; workspaceId?: string; agentId?: string }

export function Sidebar({
  selection,
  onSelect,
  onArchive,
  onCloseAgent,
  onOpenSettings,
  onOpenHost,
  onImport,
  activeOnly,
  onToggleActiveOnly,
}: {
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
  onCloseAgent: (a: Agent) => void
  onOpenSettings: () => void
  onOpenHost: (hostId: string) => void
  onImport: (projectId: string) => void
  activeOnly: boolean
  onToggleActiveOnly: () => void
}) {
  const { hosts, byHost, projects, workspaces, agents, pinned } = useStore()
  // The footer shows the first host that isn't connected.
  const down = hosts.find((h) => byHost[h.id]?.status !== 'connected')
  const downState = down && byHost[down.id]
  const [addingHost, setAddingHost] = useState(false)
  const settingsKey = useShortcut('openSettings')
  const addProjectKey = useShortcut('addProject')
  const newScratchKey = useShortcut('newScratch')
  const activeOnlyKey = useShortcut('toggleActiveOnly')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.mypaseoCollapsed ?? '[]')))
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(id)) next.add(id)
      localStorage.mypaseoCollapsed = JSON.stringify([...next])
      return next
    })

  // The project being dragged to a new place.
  const [dragged, setDragged] = useState<string>()
  const listed = projects
    .map((p) => ({ p, shownWorkspaces: sidebarWorkspaces([p], workspaces, agents, pinned, activeOnly, selection.workspaceId) }))
    .filter((x) => !activeOnly || x.shownWorkspaces.length > 0)
  /** Alt+↑/↓ on a project row moves it past its neighbor: drag & drop by keyboard. */
  const moveByKey = (e: ReactKeyboardEvent<HTMLElement>, i: number) => {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    const target = listed[i + step]
    if (!e.altKey || !step || !target || e.target !== e.currentTarget) return
    e.preventDefault()
    const row = e.currentTarget
    moveProject(listed[i].p.projectId, target.p.projectId, step > 0)
    requestAnimationFrame(() => row.focus()) // React re-inserts a row it moves down, which drops its focus
  }

  const [adding, setAdding] = useState(false)
  const hostId = useHostId()
  const newScratch = async () => {
    try {
      onSelect({ projectId: await scratchProject(hostId) })
    } catch (e) {
      alert(`Could not start a scratch: ${errorText(e)}`)
    }
  }
  const [renaming, setRenaming] = useState<Workspace>()
  // Lives here, not in the row: the selected workspace's row is unmounted while its project is collapsed.
  const [syncing, setSyncing] = useState<Record<string, 'pull' | 'push' | undefined>>({})
  const sync = async (w: Workspace, op: 'pull' | 'push') => {
    setSyncing((s) => ({ ...s, [w.id]: op }))
    try {
      const daemon = client(w.hostId)
      const r = await (op === 'pull' ? daemon.checkoutPull(w.workspaceDirectory) : daemon.checkoutPush(w.workspaceDirectory))
      if (r.error) throw new Error(r.error.message)
    } catch (e) {
      alert(`Could not ${op}: ${errorText(e)}`)
    }
    setSyncing((s) => ({ ...s, [w.id]: undefined }))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isShortcut(e, 'addProject')) {
        e.preventDefault()
        setAdding(true)
      }
      if (isShortcut(e, 'newScratch')) {
        e.preventDefault()
        void newScratch()
      }
      const op = isShortcut(e, 'pull') ? 'pull' : isShortcut(e, 'push') ? 'push' : undefined
      const w = workspaces.find((x) => x.id === selection.workspaceId)
      if (op && w?.projectKind === 'git') {
        e.preventDefault()
        if (!syncing[w.id]) void sync(w, op)
      }
      if (w && isShortcut(e, 'togglePin')) {
        e.preventDefault()
        togglePin(w.id)
      }
      if (w && isShortcut(e, 'toggleRead')) {
        e.preventDefault()
        // Like the open agent's row button, or with no agent open, the workspace menu.
        const a = agents.find((x) => x.id === selection.agentId)
        const pick = unreadPick(agents, w.id)
        if (a ? a.requiresAttention : agents.some((x) => x.workspaceId === w.id && x.requiresAttention)) void markRead(w, a)
        else if (pick && (!a || a === pick)) void markUnread(w, pick)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // reads the selection and sync state, so it re-binds every render

  return (
    <>
      {/* Focusable: with no rows, the pane itself takes the focus when it opens. Arrow keys browse the rows like a tree. */}
      <aside className="sidebar" tabIndex={-1} onKeyDown={navigateRows}>
        <div className="sidebar-head">
          <span className="section-label">Projects</span>
          <button className="icon-btn hover-only" title={`Add Project (${formatCombo(addProjectKey)})`} onClick={() => setAdding(true)}>
            <FolderAdd />
          </button>
          <button className="icon-btn hover-only" title={`New Scratch (${formatCombo(newScratchKey)})`} onClick={() => void newScratch()}>
            <ScratchAdd />
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
          {listed.map(({ p, shownWorkspaces }, i) => (
            <ProjectRow
              key={p.projectId}
              project={p}
              shownWorkspaces={shownWorkspaces}
              collapsed={collapsed}
              onToggle={toggle}
              dragged={dragged}
              onDrag={setDragged}
              onMoveByKey={(e) => moveByKey(e, i)}
              selection={selection}
              onSelect={onSelect}
              onArchive={onArchive}
              onCloseAgent={onCloseAgent}
              onImport={onImport}
              onRename={setRenaming}
              syncing={syncing}
              onSync={(w, op) => void sync(w, op)}
            />
          ))}
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
      {renaming && <RenameWorkspaceDialog workspace={renaming} onClose={() => setRenaming(undefined)} />}
    </>
  )
}
