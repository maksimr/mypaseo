import type { AgentAttentionRequiredNotification } from '@getpaseo/client/internal/daemon-client'
import { createContext, useContext, useSyncExternalStore } from 'react'
import {
  createClient,
  DEFAULT_HOST,
  errorText,
  LOCAL_URL,
  PROXY_URL,
  type Agent,
  type AgentProfile,
  type DaemonClient,
  type Host,
  type Project,
  type ProviderEntry,
  type RawAgent,
  type Workspace,
} from './daemon'
import { inOrder, moveId } from './order'

type ConnectionStatus = ReturnType<DaemonClient['getConnectionState']>['status']

type HostState = {
  status: ConnectionStatus
  /** The last connection error; kept through reconnect attempts until one succeeds. */
  error: string | null
  /** From the daemon's server_info once connected. */
  serverId?: string
  hostname?: string
  projects: Project[]
  workspaces: Workspace[]
  agents: Agent[]
  providers: ProviderEntry[]
  /** The daemon config's agentProfiles; Settings → Profiles edits them. */
  profiles: AgentProfile[]
}
const EMPTY: HostState = { status: 'idle', error: null, projects: [], workspaces: [], agents: [], providers: [], profiles: [] }

type State = {
  hosts: Host[]
  byHost: Record<string, HostState>
  /** Every host's lists merged, in host order; projects in projectOrder. */
  projects: Project[]
  workspaces: Workspace[]
  agents: Agent[]
  /** Workspace ids pinned in the sidebar; the daemon has no pin, so they live in this browser. */
  pinned: string[]
  /** Project ids in the order they were dragged to in the sidebar; kept in this browser, like Paseo desktop's. */
  projectOrder: string[]
}

const hosts: Host[] = JSON.parse(localStorage.mypaseoHosts ?? 'null') ?? [DEFAULT_HOST]
let state: State = {
  hosts,
  byHost: Object.fromEntries(hosts.map((h) => [h.id, EMPTY])),
  projects: [],
  workspaces: [],
  agents: [],
  pinned: JSON.parse(localStorage.mypaseoPinned ?? '[]'),
  projectOrder: JSON.parse(localStorage.mypaseoProjectOrder ?? '[]'),
}
const listeners = new Set<() => void>()
function set(patch: Partial<State>) {
  const s = { ...state, ...patch }
  state = {
    ...s,
    projects: inOrder(
      s.hosts.flatMap((h) => s.byHost[h.id]?.projects ?? []),
      s.projectOrder,
      (p) => p.projectId,
    ),
    workspaces: s.hosts.flatMap((h) => s.byHost[h.id]?.workspaces ?? []),
    agents: s.hosts.flatMap((h) => s.byHost[h.id]?.agents ?? []),
  }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useStore = () => useSyncExternalStore(subscribe, () => state)

function patchHost(id: string, patch: (h: HostState) => Partial<HostState>) {
  const h = state.byHost[id]
  if (h) set({ byHost: { ...state.byHost, [id]: { ...h, ...patch(h) } } })
}

const clients = new Map<string, DaemonClient>()
export const client = (hostId: string) => clients.get(hostId)!

/** The host whose daemon the components below talk to. */
export const HostContext = createContext('')
export const useHostId = () => useContext(HostContext)
/** The context host's client (or hostId's, for the component that provides the context). Changing the host's address swaps it, so effects list it as a dependency. */
export function useDaemon(hostId?: string) {
  const context = useHostId()
  const id = hostId ?? context
  return useSyncExternalStore(subscribe, () => client(id))
}
/** The context host's connection state and lists. */
export function useHost() {
  const id = useHostId()
  return useSyncExternalStore(subscribe, () => state.byHost[id])
}

/** Local for the dev proxy and the daemon's default address, else the address. */
export const hostEndpoint = (h: Host) => (h.url === PROXY_URL || h.url === LOCAL_URL ? 'Local' : new URL(h.url).host)
export function hostLabel(hostId: string) {
  const h = state.hosts.find((x) => x.id === hostId)
  return h?.label || state.byHost[hostId]?.hostname || (h ? hostEndpoint(h) : 'Unknown host')
}
/** The saved host already connected to this daemon, if any. */
export const hostOfServer = (serverId: string) => state.hosts.find((h) => state.byHost[h.id]?.serverId === serverId)

const attention = new Set<(e: AgentAttentionRequiredNotification) => void>()
/** agent_attention_required from any host. */
export function onAttention(l: (e: AgentAttentionRequiredNotification) => void) {
  attention.add(l)
  return () => void attention.delete(l)
}

function upsert<T>(list: T[], item: T, same: (x: T) => boolean): T[] {
  const i = list.findIndex(same)
  return i < 0 ? [...list, item] : list.with(i, item)
}

const withAgent = (agents: Agent[], a: Agent) => (a.archivedAt ? agents.filter((x) => x.id !== a.id) : upsert(agents, a, (x) => x.id === a.id))

function connect(host: Host) {
  const id = host.id
  const c = createClient(host)
  clients.set(id, c)
  set({ byHost: { ...state.byHost, [id]: EMPTY } })
  // A replaced or removed host's client can still emit while it closes.
  const put = (patch: Partial<HostState> | ((h: HostState) => Partial<HostState>)) =>
    clients.get(id) === c && patchHost(id, typeof patch === 'function' ? patch : () => patch)
  const tag = <T>(x: T) => ({ ...x, hostId: id })

  const loadLists = async () => {
    const [projects, providers, config] = await Promise.allSettled([c.listProjects(), c.getProvidersSnapshot(), c.getDaemonConfig()])
    if (projects.status === 'fulfilled') put({ projects: projects.value.projects.map(tag) })
    if (providers.status === 'fulfilled') put({ providers: providers.value.entries })
    if (config.status === 'fulfilled') put({ profiles: config.value.config.agentProfiles ?? [] })
  }

  c.subscribeConnectionStatus((s) => {
    put({ status: s.status, ...(s.status === 'disconnected' ? { error: s.reason ?? c.lastError } : s.status === 'connected' ? { error: null } : {}) })
    if (s.status !== 'connected') return
    const info = c.getLastServerInfoMessage()
    put({ serverId: info?.serverId, hostname: info?.hostname ?? undefined })
    void loadLists()
  })

  // Owned subscriptions start once connected and re-deliver a snapshot after every reconnect.
  c.observeWorkspaces({ page: { limit: 200 } }).subscribe({
    snapshot: (p) => put({ workspaces: p.entries.map(tag) }),
    update: (m) => {
      if (m.type !== 'workspace_update') return
      const p = m.payload
      put((h) => ({
        workspaces: p.kind === 'upsert' ? upsert(h.workspaces, tag(p.workspace), (w) => w.id === p.workspace.id) : h.workspaces.filter((w) => w.id !== p.id),
      }))
    },
  })
  c.observeAgents({ scope: 'active', page: { limit: 200 } }).subscribe({
    snapshot: (p) => put({ agents: p.entries.map((e) => tag(e.agent)).filter((a) => !a.archivedAt) }),
    update: (m) => {
      if (m.type !== 'agent_update') return
      const p = m.payload
      put((h) => ({ agents: p.kind === 'upsert' ? withAgent(h.agents, tag(p.agent)) : h.agents.filter((a) => a.id !== p.agentId) }))
    },
  })
  c.observeEvents(['project.update', 'providers_snapshot_update', 'agent_attention_required'])
  c.on((e) => {
    if (e.type === 'providers_snapshot_update' && !e.payload.cwd) put({ providers: e.payload.entries })
    if (e.type !== 'project.update') return
    const p = e.payload
    put((h) => ({
      projects: p.kind === 'upsert' ? upsert(h.projects, tag(p.project), (x) => x.projectId === p.project.projectId) : h.projects.filter((x) => x.projectId !== p.projectId),
    }))
  })
  c.onAgentAttentionRequired((e) => clients.get(id) === c && attention.forEach((l) => l(e)))

  c.connect().catch((e) => put({ error: errorText(e) }))
}

let started = false
export function startSync() {
  if (started) return
  started = true
  state.hosts.forEach(connect)
}

function saveHosts(hosts: Host[], byHost = state.byHost) {
  localStorage.mypaseoHosts = JSON.stringify(hosts)
  set({ hosts, byHost })
}
export function addHost(host: Host) {
  saveHosts([...state.hosts, host])
  connect(host)
}
/** A new address or password reconnects. */
export function updateHost(id: string, patch: Partial<Host>) {
  const host = { ...state.hosts.find((h) => h.id === id)!, ...patch }
  saveHosts(state.hosts.map((h) => (h.id === id ? host : h)))
  if ('url' in patch || 'password' in patch) {
    void clients.get(id)?.close()
    connect(host)
  }
}
export function removeHost(id: string) {
  void clients.get(id)?.close()
  clients.delete(id)
  const byHost = { ...state.byHost }
  delete byHost[id]
  saveHosts(
    state.hosts.filter((h) => h.id !== id),
    byHost,
  )
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

/** The workspaces the sidebar lists, in order. activeOnly keeps pinned ones, and the selected one so opening it (which clears unread) doesn't hide it. */
export const sidebarWorkspaces = (projects: Project[], workspaces: Workspace[], agents: Agent[], pinned: string[], activeOnly: boolean, selectedId?: string) =>
  projects
    .flatMap((p) => projectWorkspaces(p.projectId, workspaces, agents))
    .filter((w) => !activeOnly || w.id === selectedId || pinned.includes(w.id) || agents.some((a) => a.workspaceId === w.id && isActive(a)))

export function togglePin(workspaceId: string) {
  const pinned = state.pinned.includes(workspaceId) ? state.pinned.filter((id) => id !== workspaceId) : [...state.pinned, workspaceId]
  localStorage.mypaseoPinned = JSON.stringify(pinned)
  set({ pinned })
}

/** Puts the project before or after target in the sidebar. */
export function moveProject(projectId: string, target: string, after: boolean) {
  const json = JSON.stringify(moveId(state.projects.map((p) => p.projectId), state.projectOrder, projectId, target, after))
  if (json === localStorage.mypaseoProjectOrder) return // dragover repeats the same move
  localStorage.mypaseoProjectOrder = json
  set({ projectOrder: JSON.parse(json) })
}

/** The daemon ties every workspace to a project, so scratches are workspaces in their own folders under this one, a project of its own. */
const SCRATCHES = '~/.paseo/scratches'
export const isScratch = (rootPath: string) => /[/\\]\.paseo[/\\]scratches$/.test(rootPath)
/** The daemon names a project after its folder; the scratches folder is lowercase. */
export const projectName = (p: Project) => p.projectCustomName || (isScratch(p.projectRootPath) ? 'Scratches' : p.projectDisplayName)

/** The host's scratches project; the first scratch creates it. */
export async function scratchProject(hostId: string) {
  const found = state.projects.find((p) => p.hostId === hostId && isScratch(p.projectRootPath))
  if (found) return found.projectId
  const daemon = client(hostId)
  const created = await daemon.createProjectDirectory({ parentPath: '~/.paseo', name: 'scratches' })
  // The folder outlives its project when the project is removed.
  const res = created.errorCode === 'directory_exists' ? await daemon.addProject(SCRATCHES) : created
  if (!res.project) throw new Error(res.error ?? 'No project was created')
  // So it can be selected before its project.update arrives.
  const project = { ...res.project, hostId }
  patchHost(hostId, (h) => ({ projects: upsert(h.projects, project, (x) => x.projectId === project.projectId) }))
  return project.projectId
}

/** The daemon has no workspace delete: removing permanently deletes the agents, then archives the workspace. */
export async function archiveWorkspace(w: Workspace, deleteAgents: boolean) {
  const daemon = client(w.hostId)
  try {
    // shortcut: only deletes agents in the sidebar; agents archived earlier stay in history.
    if (deleteAgents) await Promise.all(state.agents.filter((a) => a.workspaceId === w.id).map((a) => daemon.deleteAgent(a.id)))
    const { error } = await daemon.archiveWorkspace(w.id)
    if (error) throw new Error(error)
    return true
  } catch (e) {
    alert(`Could not ${deleteAgents ? 'remove' : 'archive'} workspace: ${errorText(e)}`)
    return false
  }
}

/** Closing an agent archives it: it leaves the sidebar and tabs but stays in the daemon's history. */
export async function archiveAgent(a: Agent) {
  try {
    const { archivedAt } = await client(a.hostId).archiveAgent(a.id)
    patchHost(a.hostId, (h) => ({ agents: withAgent(h.agents, { ...a, archivedAt }) }))
    return true
  } catch (e) {
    alert(`Could not close agent: ${errorText(e)}`)
    return false
  }
}

/** Agents marked unread while open: Chat leaves them unread until they're opened or finish again. */
export const keptUnread = new Set<string>()

/** Unread is the daemon's attention flag. The daemon only marks a whole workspace unread, which flags its unreadPick: pass that agent. */
export async function markUnread(w: Workspace, pick: Agent) {
  keptUnread.add(pick.id)
  try {
    await client(w.hostId).markWorkspaceUnread(w.id)
  } catch (e) {
    alert(`Could not mark unread: ${errorText(e)}`)
  }
}

/** Clears the attention flag of one agent, or of every agent in the workspace. */
export async function markRead(w: Workspace, a?: Agent) {
  try {
    const daemon = client(w.hostId)
    await (a ? daemon.clearAgentAttention(a.id) : daemon.clearWorkspaceAttention(w.id))
  } catch (e) {
    alert(`Could not mark read: ${errorText(e)}`)
  }
}

/** Apply an agent snapshot returned by an RPC before its agent_update arrives. */
export function rememberAgent(hostId: string, raw: RawAgent) {
  const agent = { ...raw, hostId }
  patchHost(hostId, (h) => ({ agents: withAgent(h.agents, agent) }))
  return agent
}

/** After Settings saves the daemon's agentProfiles; the daemon sends no event for config changes. */
export const setProfiles = (hostId: string, profiles: AgentProfile[]) => patchHost(hostId, () => ({ profiles }))
