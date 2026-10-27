import { useSyncExternalStore } from 'react'
import type { RawAgent } from '../../daemon'

// The daemon has a new agent's workspace at once, but its process takes seconds more to start: a send opens the chat on
// a stand-in meanwhile, which shows the prompt and holds further sends until the agent's first turn has started.
const prompts = new Map<string, string>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** Marks an agent as starting with its prompt, or, without one, as started. */
export function setStarting(agentId: string, prompt?: string) {
  if (prompt === undefined) prompts.delete(agentId)
  else prompts.set(agentId, prompt)
  listeners.forEach((l) => l())
}

/** The prompt of an agent a send is still starting. */
export const useStarting = (agentId: string | undefined) => useSyncExternalStore(subscribe, () => (agentId ? prompts.get(agentId) : undefined))

type Config = { provider: string; model?: string; thinkingOptionId?: string; modeId?: string; labels?: Record<string, string> }

/** The agent as the store holds it until the daemon's agent_update replaces it: running, so its tab, row and chat show it working. */
export function standIn(id: string, workspaceId: string, cwd: string, prompt: string, config: Config): RawAgent {
  const now = new Date().toISOString()
  return {
    id,
    workspaceId,
    cwd,
    provider: config.provider,
    model: config.model ?? null,
    thinkingOptionId: config.thinkingOptionId ?? null,
    currentModeId: config.modeId ?? null,
    availableModes: [],
    labels: config.labels ?? {},
    // As the daemon titles it: the prompt's first line.
    title: prompt.trim().split('\n')[0].slice(0, 60).trim(),
    status: 'running',
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: now,
    pendingPermissions: [],
    persistence: null,
    capabilities: {
      supportsStreaming: false,
      supportsSessionPersistence: false,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: false,
      supportsRewindConversation: false,
      supportsRewindFiles: false,
    },
  }
}
