import type { DaemonClient } from '../../daemon'

export type HistoryEntry = Awaited<ReturnType<DaemonClient['fetchAgentHistory']>>['entries'][number]

/** A workspace's agents archived this close to its last one were archived with it; earlier ones had been closed. */
const WITH_WORKSPACE_MS = 60_000

/**
 * A project's archived workspaces, most recently archived first. The daemon doesn't list archived workspaces, so these
 * are the inactive workspaces of archived agents: one archived without agents, or removed (which deletes them), isn't
 * found. agentIds: all its agents, which removing it deletes; restoreIds: the ones archived with it, which restoring
 * it brings back.
 */
export function archivedWorkspaces(entries: HistoryEntry[], activeIds: string[]) {
  const byId = new Map<string, { id: string; name: string; branch: string | null; agents: { id: string; at: number }[] }>()
  for (const { agent, project } of entries) {
    const id = agent.workspaceId
    if (!id || !agent.archivedAt || activeIds.includes(id)) continue
    const w = byId.get(id) ?? { id, name: project.workspaceName || agent.cwd, branch: project.checkout.currentBranch, agents: [] }
    w.agents.push({ id: agent.id, at: Date.parse(agent.archivedAt) })
    byId.set(id, w)
  }
  return [...byId.values()]
    .map(({ agents, ...w }) => {
      const at = Math.max(...agents.map((a) => a.at))
      return {
        ...w,
        at,
        agentIds: agents.map((a) => a.id),
        restoreIds: agents.filter((a) => at - a.at < WITH_WORKSPACE_MS).map((a) => a.id),
      }
    })
    .sort((a, b) => b.at - a.at)
}
