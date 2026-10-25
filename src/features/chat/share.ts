import type { PickOption } from '../../components/Options'
import type { TimelineItem } from '../../daemon'
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

/** Share From Here's mark of each item by index, undefined where it doesn't work: in a room, see `shareable`. */
export const roomMarks = (room: RoomItem[]) => room.map((r) => (shareable(r) ? markOf(r) : undefined))

/** A message a fork of its agent can end at, with its text for the Context pick. */
export type ForkPoint = Mark & { messageId: string; text: string }

/** In a chat without a room, the agent's messages a fork can end at (there are no room posts for a range). `times[i]`
 *  is `items[i]`'s time. */
export const ownMarks = (items: TimelineItem[], times: string[], agentId: string, handle: string) =>
  items.map((x, i): ForkPoint | undefined =>
    x.type === 'assistant_message' && x.messageId ? { at: times[i], handle, agentId, messageId: x.messageId, text: x.text } : undefined,
  )

/** The Context pick of a fork at one of the chat's messages. */
export const forkId = (m: Mark) => `fork:${m.messageId}`

/** A message's first words, markup and code fences' languages dropped. */
const excerpt = (text: string) => {
  const t = text.replace(/```\S*/g, ' ').replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim()
  return t.length > 48 ? `${t.slice(0, 47)}…` : t
}

/** A pick starts the range over; with Shift it ends it there, or starts it there if that's before the start. */
export function pickRange(share: Share | undefined, m: Mark, end: boolean): Share {
  if (!end || !share) return { from: m }
  return Date.parse(m.at) < Date.parse(share.from.at) ? { from: m, to: share.from } : { from: share.from, to: m }
}

export const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5)

/** The message a fork ends at: the range's last one. */
export const forkEnd = (share: Share | undefined) => share && (share.to ?? share.from)

/** A joining chip's Context picks. Without a room there's nothing to range over: a fork at any of `forks`, the latest
 *  first. In a room, the range and a fork at its end need a picked message, the fork its `messageId`. */
export function contextOptions(share: Share | undefined, room: boolean, forks: ForkPoint[] = []): PickOption[] {
  const options: PickOption[] = [['none', 'No History']]
  if (!room) return [...options, ...forks.toReversed().map((f): PickOption => [forkId(f), `Fork @${f.handle} ${hhmm(f.at)} · ${excerpt(f.text)}`])]
  const fork = forkEnd(share)
  if (share) options.push(['range', share.to ? `${hhmm(share.from.at)}–${hhmm(share.to.at)}` : `From ${hhmm(share.from.at)}`])
  options.push(['all', 'Whole room'])
  if (fork?.messageId) options.push(['fork', `Fork @${fork.handle}`])
  return options
}
