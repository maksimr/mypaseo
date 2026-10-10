import {
  Archive,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  Import,
  Loader2,
  MessageCirclePlus,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { daemon, errorText, type Agent, type Workspace } from '../daemon'
import { clickable } from '../a11y'
import { formatCombo, useShortcut } from '../keymap'
import { byRecent, projectWorkspaces as sortedWorkspaces, useStore } from '../store'

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

/** onClick for a popover menu trigger: keeps the row from activating and puts the menu under the trigger. */
const placeMenu = (menuId: string) => (e: MouseEvent<HTMLElement>) => {
  e.stopPropagation()
  // shortcut: fixed placement under the trigger, no edge flipping; switch to CSS anchor positioning once Baseline.
  const r = e.currentTarget.getBoundingClientRect()
  const menu = document.getElementById(menuId)!
  menu.style.top = `${r.bottom + 4}px`
  menu.style.left = `${r.left}px`
}

export function Sidebar({
  selection,
  onSelect,
  onArchive,
  onOpenSettings,
  onImport,
}: {
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
  onOpenSettings: () => void
  onImport: (projectId: string) => void
}) {
  const { projects, workspaces, agents, status, error } = useStore()
  const settingsKey = useShortcut('openSettings')
  const newWorkspaceKey = useShortcut('newWorkspace')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.mypaseoCollapsed ?? '[]')))
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(id)) next.add(id)
      localStorage.mypaseoCollapsed = JSON.stringify([...next])
      return next
    })

  const addProject = async () => {
    const cwd = prompt('Project directory (absolute path)')?.trim()
    if (!cwd) return
    try {
      await daemon.addProject(cwd)
    } catch (e) {
      alert(`Could not add project: ${errorText(e)}`)
    }
  }

  const removeProject = async (projectId: string, name: string) => {
    if (!confirm(`Remove project "${name}"? Its agents are archived; files on disk are kept.`)) return
    try {
      await daemon.removeProject(projectId)
    } catch (e) {
      alert(`Could not remove project: ${errorText(e)}`)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="section-label">Projects</span>
        <button className="icon-btn hover-only" title="Add Project" onClick={addProject}>
          <FolderAdd />
        </button>
      </div>
      <nav className="tree">
        {projects.length === 0 && <div className="empty">{status === 'connected' ? 'No projects yet' : 'Connecting…'}</div>}
        {projects.map((p) => {
          const open = !collapsed.has(p.projectId)
          const projectWorkspaces = sortedWorkspaces(p.projectId, workspaces, agents)
          const name = p.projectCustomName || p.projectDisplayName
          const menuId = `project-menu-${p.projectId}`
          return (
            <div key={p.projectId}>
              <div
                className={`row project ${selection.projectId === p.projectId && !selection.workspaceId ? 'active' : ''}`}
                aria-expanded={open}
                {...clickable(() => toggle(p.projectId))}
              >
                {open ? <FolderExpanded /> : <Folder size={15} />}
                <span className="truncate">{name}</span>
                <span className="chevron hover-only">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                <span className="grow" />
                <button
                  className="icon-btn hover-only"
                  title="Project Actions"
                  popoverTarget={menuId}
                  onClick={placeMenu(menuId)}
                >
                  <Ellipsis size={13} />
                </button>
                <button
                  className="icon-btn hover-only"
                  title={`New Workspace (${formatCombo(newWorkspaceKey)})`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect({ projectId: p.projectId })
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div id={menuId} popover="auto" className="menu">
                <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => onImport(p.projectId)}>
                  <Import size={14} /> Import Session
                </button>
                <button
                  className="danger"
                  popoverTarget={menuId}
                  popoverTargetAction="hide"
                  onClick={() => removeProject(p.projectId, name)}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
              {open &&
                projectWorkspaces.map((w) => (
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
        <span className={`dot ${status}`} title={error ?? status} />
        <span className="muted grow truncate">{status === 'connected' ? 'Connected' : (error ?? status)}</span>
        <button className="icon-btn" title={`Settings (${formatCombo(settingsKey)})`} onClick={onOpenSettings}>
          <Settings size={15} />
        </button>
      </div>
    </aside>
  )
}

function WorkspaceRow({
  workspace: w,
  agents,
  collapsed,
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
  // A collapsed workspace hides its agents, so it shows their selection itself.
  const active = selection.workspaceId === w.id && (!selection.agentId || collapsed)
  const select = (agentId?: string) => onSelect({ projectId: w.projectId, workspaceId: w.id, agentId })
  const name = w.title || w.name
  const menuId = `workspace-menu-${w.id}`
  const archive = (deleteAgents: boolean) => onArchive(w, deleteAgents)

  return (
    <>
      <div className={`row workspace ${active ? 'active' : ''}`} {...clickable(() => select(agents[0]?.id))}>
        {agents.length > 0 ? (
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
        <span className="grow truncate">{name}</span>
        <button className="icon-btn hover-swap" title="Workspace Actions" popoverTarget={menuId} onClick={placeMenu(menuId)}>
          <Ellipsis size={13} />
        </button>
        <button
          className="icon-btn hover-swap"
          title="New Agent"
          onClick={(e) => {
            e.stopPropagation()
            select()
          }}
        >
          <Plus size={13} />
        </button>
        <StatusMark agents={agents} />
      </div>
      <div id={menuId} popover="auto" className="menu">
        <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => archive(false)}>
          <Archive size={14} /> Archive
        </button>
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
            <MessageCirclePlus size={9} className="muted" />
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
