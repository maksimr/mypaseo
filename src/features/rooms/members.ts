import type { Agent } from '../../daemon'
import { ROOM_LABELS } from '../../rooms.ts'
import { colorVar } from './colors.ts'
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

type Look = { color?: string; icon?: string }

/** A profile's color, as a CSS color, and icon. */
export const look = (p?: Look): Look => ({ color: colorVar(p?.color), icon: p?.icon })

/** Its color (a CSS color) and icon: its profile's, or, started from none, the default agent's (`def`). */
export function lookOf(agent: Labeled, profiles: readonly (Look & { id: string })[], def?: Look) {
  const id = agent.labels[PROFILE]
  return look(id ? profiles.find((p) => p.id === id) : def)
}
