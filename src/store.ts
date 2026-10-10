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
  daemon.observeEvents(['project.update', 'providers_snapshot_update'])
  daemon.on((e) => {
    if (e.type === 'providers_snapshot_update' && !e.payload.cwd) set({ providers: e.payload.entries })
    if (e.type !== 'project.update') return
    const p = e.payload
    if (p.kind === 'upsert') set({ projects: upsert(state.projects, p.project, (x) => x.projectId === p.project.projectId) })
    else set({ projects: state.projects.filter((x) => x.projectId !== p.projectId) })
  })

  daemon.connect().catch((e) => set({ error: errorText(e) }))
}

/** Apply an agent snapshot returned by an RPC before its agent_update arrives. */
export const rememberAgent = upsertAgent
