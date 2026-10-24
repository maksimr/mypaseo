import type { Agent } from '../../daemon'
import { ROOM_LABELS } from '../../rooms.ts'
import { slug } from './handles.ts'

const { room: ROOM, handle: HANDLE, profile: PROFILE } = ROOM_LABELS

type Labeled = Pick<Agent, 'id' | 'labels'>

/** The room the agent belongs to (its lead's id), if any. */
export const roomId = (agent: Labeled): string | undefined => agent.labels[ROOM]

export const isLead = (agent: Labeled) => agent.labels[ROOM] === agent.id

export const roomMembers = <A extends Labeled & Pick<Agent, 'archivedAt'>>(agents: A[], room: string) =>
  agents.filter((a) => !a.archivedAt && a.labels[ROOM] === room)

/** Its handle label, else its profile's slug, else `agent` (the default agent). */
export function handleOf(agent: Labeled, profiles: readonly { id: string; name: string }[]) {
  const profile = profiles.find((p) => p.id === agent.labels[PROFILE])
  return agent.labels[HANDLE] ?? (profile ? slug(profile.name) : 'agent')
}
