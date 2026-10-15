import { ChevronDown, ChevronRight, Ellipsis, Folder, Import, Plus, Trash2 } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { errorText, type Agent, type Project, type Workspace } from '../../daemon'
import { clickable } from '../../a11y'
import { formatCombo, useShortcut } from '../../keymap'
import { byRecent, client, hostLabel, isScratch, moveProject, projectName, projectWorkspaces as sortedWorkspaces, useStore } from '../../store'
import { FolderExpanded, Scratches } from '../../components/icons'
import { placeMenu } from '../../components/menu'
import { StatusMark } from './StatusMark'
import { WorkspaceRow } from './WorkspaceRow'
import type { Selection } from './Sidebar'

async function removeProject(p: Project, name: string) {
  if (!confirm(`Remove project "${name}"? Its agents are archived; files on disk are kept.`)) return
  try {
    await client(p.hostId).removeProject(p.projectId)
  } catch (e) {
    alert(`Could not remove project: ${errorText(e)}`)
  }
}

/** A project and, unless collapsed, its workspaces. Drag it, or Alt+↑/↓, to reorder. */
export function ProjectRow({
  project: p,
  shownWorkspaces,
  collapsed,
  onToggle,
  dragged,
  onDrag,
  onMoveByKey,
  selection,
  onSelect,
  onArchive,
  onCloseAgent,
  onImport,
  onRename,
  syncing,
  onSync,
}: {
  project: Project
  shownWorkspaces: Workspace[]
  collapsed: Set<string>
  onToggle: (id: string) => void
  dragged: string | undefined
  onDrag: (projectId: string | undefined) => void
  onMoveByKey: (e: ReactKeyboardEvent<HTMLElement>) => void
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
  onCloseAgent: (a: Agent) => void
  onImport: (projectId: string) => void
  onRename: (w: Workspace) => void
  syncing: Record<string, 'pull' | 'push' | undefined>
  onSync: (w: Workspace, op: 'pull' | 'push') => void
}) {
  const { hosts, workspaces, agents, pinned } = useStore()
  const newWorkspaceKey = useShortcut('newWorkspace')
  const open = !collapsed.has(p.projectId)
  const projectWorkspaces = sortedWorkspaces(p.projectId, workspaces, agents)
  const name = projectName(p)
  const menuId = `project-menu-${p.projectId}`
  const row = clickable(() => onToggle(p.projectId))
  return (
    <div
      className={dragged === p.projectId ? 'dragging' : undefined}
      onDragOver={(e) => {
        if (!dragged) return // a file or text, not a project
        e.preventDefault() // accepts the drop
        const r = e.currentTarget.getBoundingClientRect()
        // The list reorders live; halves keep a short row from flipping back and forth over a tall one.
        if (dragged !== p.projectId) moveProject(dragged, p.projectId, e.clientY > r.top + r.height / 2)
      }}
    >
      <div
        className="row project"
        aria-expanded={open}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        draggable
        onDragStart={(e) => {
          // A custom type: a text field won't take the drop.
          e.dataTransfer.setData('application/x-mypaseo-project', p.projectId)
          e.dataTransfer.effectAllowed = 'move'
          setTimeout(() => onDrag(p.projectId)) // after the browser snapshots the drag image, so it isn't dimmed
        }}
        onDragEnd={() => onDrag(undefined)}
        {...row}
        onKeyDown={(e) => {
          row.onKeyDown(e)
          onMoveByKey(e)
        }}
      >
        {isScratch(p.projectRootPath) ? <Scratches /> : open ? <FolderExpanded /> : <Folder size={15} />}
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
            pinned={pinned.includes(w.id)}
            onToggle={() => onToggle(w.id)}
            selection={selection}
            onSelect={onSelect}
            onArchive={onArchive}
            onCloseAgent={onCloseAgent}
            onRename={() => onRename(w)}
            syncing={syncing[w.id]}
            onSync={(op) => onSync(w, op)}
          />
        ))}
    </div>
  )
}
