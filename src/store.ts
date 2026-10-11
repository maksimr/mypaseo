import { useSyncExternalStore } from 'react'
import { daemon, errorText, type Agent, type Project, type ProviderEntry, type Workspace } from './daemon'

export type ConnectionStatus = ReturnType<typeof daemon.getConnectionState>['status']

type State = {
  status: ConnectionStatus
  error: string | null
  projects: Project[]
  workspaces: Workspace[]
  agents: Agent[]
  providers: ProviderEntry[]
}

let state: State = { status: 'idle', error: null, projects: [], workspaces: [], agents: [], providers: [] }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useStore = () => useSyncExternalStore(subscribe, () => state)

function upsert<T>(list: T[], item: T, same: (x: T) => boolean): T[] {
  const i = list.findIndex(same)
  return i < 0 ? [...list, item] : list.with(i, item)
}

function upsertAgent(agent: Agent) {
  const rest = state.agents.filter((a) => a.id !== agent.id)
  set({ agents: agent.archivedAt ? rest : upsert(state.agents, agent, (a) => a.id === agent.id) })
}

async function loadProjectsAndProviders() {
  const [projects, providers] = await Promise.allSettled([daemon.listProjects(), daemon.getProvidersSnapshot()])
  if (projects.status === 'fulfilled') set({ projects: projects.value.projects })
  if (providers.status === 'fulfilled') set({ providers: providers.value.entries })
}

let started = false
export function startSync() {
  if (started) return
  started = true

  daemon.subscribeConnectionStatus((s) => {
    set({ status: s.status, error: s.status === 'disconnected' ? (s.reason ?? daemon.lastError) : null })
    if (s.status === 'connected') void loadProjectsAndProviders()
  })

  // Owned subscriptions start once connected and re-deliver a snapshot after every reconnect.
  daemon.observeWorkspaces({ page: { limit: 200 } }).subscribe({
    snapshot: (p) => set({ workspaces: p.entries }),
    update: (m) => {
      if (m.type !== 'workspace_update') return
      const p = m.payload
      if (p.kind === 'upsert') set({ workspaces: upsert(state.workspaces, p.workspace, (w) => w.id === p.workspace.id) })
      else set({ workspaces: state.workspaces.filter((w) => w.id !== p.id) })
    },
  })
  daemon.observeAgents({ scope: 'active', page: { limit: 200 } }).subscribe({
    snapshot: (p) => set({ agents: p.entries.map((e) => e.agent).filter((a) => !a.archivedAt) }),
    update: (m) => {
      if (m.type !== 'agent_update') return
      const p = m.payload
      if (p.kind === 'upsert') upsertAgent(p.agent)
      else set({ agents: state.agents.filter((a) => a.id !== p.agentId) })
    },
  })
  daemon.observeEvents(['project.update', 'providers_snapshot_update', 'agent_attention_required'])
  daemon.on((e) => {
    if (e.type === 'providers_snapshot_update' && !e.payload.cwd) set({ providers: e.payload.entries })
    if (e.type !== 'project.update') return
    const p = e.payload
    if (p.kind === 'upsert') set({ projects: upsert(state.projects, p.project, (x) => x.projectId === p.project.projectId) })
    else set({ projects: state.projects.filter((x) => x.projectId !== p.projectId) })
  })

  daemon.connect().catch((e) => set({ error: errorText(e) }))
}

export const byRecent = (a: Agent, b: Agent) => b.createdAt.localeCompare(a.createdAt)

/** A project's workspaces in sidebar order. */
export function projectWorkspaces(projectId: string, workspaces: Workspace[], agents: Agent[]) {
  // shortcut: the daemon doesn't send workspace createdAt, so its oldest active agent stands in (agentless = just created, sorts last); use the real field once the protocol exposes it.
  const oldestAgentAt = (workspaceId: string) =>
    agents.reduce((min, a) => (a.workspaceId === workspaceId && a.createdAt < min ? a.createdAt : min), '\uffff')
  return workspaces.filter((w) => w.projectId === projectId).sort((a, b) => oldestAgentAt(a.id).localeCompare(oldestAgentAt(b.id)))
}

/** Running, or unread / waiting on a permission. */
const isActive = (a: Agent) => a.status === 'running' || a.pendingPermissions.length > 0 || a.requiresAttention

/** The workspaces the sidebar lists, in order. activeOnly keeps the selected one so opening it (which clears unread) doesn't hide it. */
export const sidebarWorkspaces = (projects: Project[], workspaces: Workspace[], agents: Agent[], activeOnly: boolean, selectedId?: string) =>
  projects
    .flatMap((p) => projectWorkspaces(p.projectId, workspaces, agents))
    .filter((w) => !activeOnly || w.id === selectedId || agents.some((a) => a.workspaceId === w.id && isActive(a)))

/** The daemon has no workspace delete: removing permanently deletes the agents, then archives the workspace. */
export async function archiveWorkspace(workspaceId: string, deleteAgents: boolean) {
  try {
    // shortcut: only deletes agents in the sidebar; agents archived earlier stay in history.
    if (deleteAgents) await Promise.all(state.agents.filter((a) => a.workspaceId === workspaceId).map((a) => daemon.deleteAgent(a.id)))
    const { error } = await daemon.archiveWorkspace(workspaceId)
    if (error) throw new Error(error)
    return true
  } catch (e) {
    alert(`Could not ${deleteAgents ? 'remove' : 'archive'} workspace: ${errorText(e)}`)
    return false
  }
}

/** Apply an agent snapshot returned by an RPC before its agent_update arrives. */
export const rememberAgent = upsertAgent
