import type { Agent } from './daemon'

/**
 * The agent the daemon flags when its workspace is marked unread, the only unread mark it has: the most recently
 * updated top-level agent that finished and is read. Mirrors handleWorkspaceMarkUnreadRequest in @getpaseo/server.
 */
export const unreadPick = (agents: Agent[], workspaceId: string) =>
  agents
    .filter(
      (a) =>
        a.workspaceId === workspaceId &&
        (a.status === 'idle' || a.status === 'closed') &&
        !a.requiresAttention &&
        !a.pendingPermissions.length &&
        !a.labels['paseo.parent-agent-id'],
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))[0]
