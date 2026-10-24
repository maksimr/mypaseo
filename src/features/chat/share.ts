import type { PickOption } from '../../components/Options'
import type { RoomItem } from '../rooms/roomView'

/** A room message picked with Share From Here. `at` is its time in the room (the plugin's for a user post, the
 *  timeline's for an agent's message), which a shared range compares inclusively. */
export type Mark = { at: string; handle: string; agentId: string; messageId?: string }
/** The range a joining agent can get: from a picked message, to another one or the room's end. */
export type Share = { from: Mark; to?: Mark }

/** What Share From Here works on: the user's public posts and the agents' public messages. */
export const shareable = (r: RoomItem) =>
  !r.private && (r.item.type === 'assistant_message' || (r.item.type === 'plugin' && r.item.kind === 'room.post'))

export const markOf = (r: RoomItem): Mark => ({
  at: r.timestamp,
  handle: r.author,
  agentId: r.agentId,
  messageId: r.item.type === 'assistant_message' ? r.item.messageId : undefined,
})

/** A pick starts the range over; with Shift it ends it there, or starts it there if that's before the start. */
export function pickRange(share: Share | undefined, m: Mark, end: boolean): Share {
  if (!end || !share) return { from: m }
  return Date.parse(m.at) < Date.parse(share.from.at) ? { from: m, to: share.from } : { from: share.from, to: m }
}

export const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5)

/** The message a fork ends at: the range's last one. */
export const forkEnd = (share: Share | undefined) => share && (share.to ?? share.from)

/** A joining chip's Context picks. The range and fork need a picked message, a fork its `messageId`; the whole room
 *  needs a room. */
export function contextOptions(share: Share | undefined, room: boolean): PickOption[] {
  const fork = forkEnd(share)
  const options: PickOption[] = [['none', 'None']]
  if (share) options.push(['range', share.to ? `${hhmm(share.from.at)}–${hhmm(share.to.at)}` : `From ${hhmm(share.from.at)}`])
  if (room) options.push(['all', 'Whole room'])
  if (fork?.messageId) options.push(['fork', `Fork @${fork.handle}`])
  return options
}
