import type { Agent } from '../../daemon'
import { isLead, roomId } from '../rooms/members.ts'

/**
 * A workspace's agents as sidebar rows, in the list's order, except that a room's other members move under its lead's
 * row (`nested`); `room` is the lead's member count, itself included. A member whose lead isn't in the list (archived)
 * keeps a row of its own.
 */
export function roomTree<A extends Pick<Agent, 'id' | 'labels'>>(agents: A[]) {
  const nested = (a: A) => !isLead(a) && agents.some((x) => x.id === roomId(a))
  return agents
    .filter((a) => !nested(a))
    .flatMap((agent) => {
      const members = isLead(agent) ? agents.filter((m) => m !== agent && roomId(m) === agent.id) : []
      return [
        { agent, nested: false, room: members.length && members.length + 1 },
        ...members.map((m) => ({ agent: m, nested: true, room: 0 })),
      ]
    })
}
