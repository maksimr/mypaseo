import { getParentAgentIdFromLabels } from '@getpaseo/protocol/agent-labels'
import type { Agent } from '../../daemon'

type Labeled = Pick<Agent, 'id' | 'labels' | 'workspaceId'>

/** The agent that started this one with Paseo's `create_agent` tool, if any: this one is its subagent. */
export const parentId = (agent: Pick<Agent, 'labels'>) => getParentAgentIdFromLabels(agent.labels)

/**
 * Its parent among `agents`, in its workspace. A subagent in another workspace (a worktree of its own) stands on its
 * own there, as in Paseo desktop.
 */
export function parentIn<A extends Labeled>(agent: A, agents: A[]) {
  const id = parentId(agent)
  return id ? agents.find((a) => a.id === id && a.workspaceId === agent.workspaceId) : undefined
}

/** The agents without their parent among them: the sidebar's rows. The others show in their parent's track. */
export const topLevel = <A extends Labeled>(agents: A[]) => agents.filter((a) => !parentIn(a, agents))

/**
 * The subagents of `agent` among `agents` as rows of a tree: each right after its parent, at `depth` 1 for its own;
 * only under an `open` agent.
 */
export const subtree = <A extends Labeled>(agent: A, agents: A[], open: ReadonlySet<string>, depth = 1): { agent: A; depth: number }[] =>
  open.has(agent.id)
    ? agents.filter((a) => parentIn(a, agents) === agent).flatMap((a) => [{ agent: a, depth }, ...subtree(a, agents, open, depth + 1)])
    : []

/** The subagents of `roots` among `agents`, at any depth. */
export function descendants<A extends Labeled>(agents: A[], roots: A[]): A[] {
  const out: A[] = []
  let level = roots
  while (level.length) {
    level = agents.filter((a) => !out.includes(a) && !roots.includes(a) && level.some((p) => p === parentIn(a, agents)))
    out.push(...level)
  }
  return out
}
