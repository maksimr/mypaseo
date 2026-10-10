import { ChevronDown, ChevronRight, FolderClosed, FolderOpen, FolderPlus, GitBranch, Import, Loader2, MessageSquare, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { daemon, errorText, type Agent, type Workspace } from '../daemon'
import { clickable } from '../a11y'
import { useStore } from '../store'

export type Selection = { projectId?: string; workspaceId?: string; agentId?: string }

const byRecent = (a: Agent, b: Agent) => b.createdAt.localeCompare(a.createdAt)

export function Sidebar({
  selection,
  onSelect,
  onOpenSettings,
  onImport,
}: {
  selection: Selection
  onSelect: (s: Selection) => void
  onOpenSettings: () => void
  onImport: (projectId: string) => void
}) {
  const { projects, workspaces, agents, status, error } = useStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(id)) next.add(id)
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

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="section-label">Projects</span>
        <button className="icon-btn" title="Add project" onClick={addProject}>
          <FolderPlus size={15} />
        </button>
      </div>
      <nav className="tree">
        {projects.length === 0 && <div className="empty">{status === 'connected' ? 'No projects yet' : 'Connecting…'}</div>}
        {projects.map((p) => {
          const open = !collapsed.has(p.projectId)
          const projectWorkspaces = workspaces.filter((w) => w.projectId === p.projectId)
          return (
            <div key={p.projectId}>
              <div
                className={`row project ${selection.projectId === p.projectId && !selection.workspaceId ? 'active' : ''}`}
                aria-expanded={open}
                {...clickable(() => toggle(p.projectId))}
              >
                {open ? <FolderOpen size={15} /> : <FolderClosed size={15} />}
                <span className="grow truncate">{p.projectCustomName || p.projectDisplayName}</span>
                <button
                  className="icon-btn hover-only"
                  title="Import session"
                  onClick={(e) => {
                    e.stopPropagation()
                    onImport(p.projectId)
                  }}
                >
                  <Import size={14} />
                </button>
                <button
                  className="icon-btn hover-only"
                  title="New workspace"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect({ projectId: p.projectId })
                  }}
                >
                  <Plus size={14} />
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
                  />
                ))}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        <span className={`dot ${status}`} title={error ?? status} />
        <span className="muted grow truncate">{status === 'connected' ? 'Connected' : (error ?? status)}</span>
        <button className="icon-btn" title="Settings" onClick={onOpenSettings}>
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
}: {
  workspace: Workspace
  agents: Agent[]
  collapsed: boolean
  onToggle: () => void
  selection: Selection
  onSelect: (s: Selection) => void
}) {
  const branch = w.project?.checkout?.currentBranch
  const active = selection.workspaceId === w.id && !selection.agentId
  const select = (agentId?: string) => onSelect({ projectId: w.projectId, workspaceId: w.id, agentId })
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
        {branch ? <GitBranch size={14} className="muted" /> : null}
        <span className="grow truncate">{w.title || w.name}</span>
        <StatusMark agents={agents} />
        <button
          className="icon-btn hover-only"
          title="New agent"
          onClick={(e) => {
            e.stopPropagation()
            select()
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      {!collapsed &&
        agents.map((a) => (
          <div
            key={a.id}
            className={`row agent ${selection.agentId === a.id ? 'active' : ''}`}
            {...clickable(() => select(a.id))}
          >
            <MessageSquare size={13} className="muted" />
            <span className="grow truncate">{a.title || 'New agent'}</span>
            <StatusMark agents={[a]} />
          </div>
        ))}
    </>
  )
}

/** Derived from agents: the daemon's workspace status can lag behind them. */
function StatusMark({ agents }: { agents: Agent[] }) {
  if (agents.some((a) => a.status === 'running')) return <Loader2 size={13} className="spin muted" aria-label="Running" />
  if (agents.some((a) => a.pendingPermissions.length > 0 || a.requiresAttention))
    return <span className="dot attention" title="Needs attention" />
  if (agents.some((a) => a.status === 'error')) return <span className="dot failed" title="Error" />
  return null
}
