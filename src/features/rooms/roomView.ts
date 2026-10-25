import type { TimelineItem } from '../../daemon'

type Entry = { item: TimelineItem; timestamp: string }
type Member = { agentId: string; handle: string; entries: Entry[]; running?: boolean }
/** author: the member's handle, or `user` for what the user wrote. private: part of a direct message exchange. */
export type RoomItem = Entry & { author: string; agentId: string; private: boolean; key: string }

// The last line of every delivery's text (Deliveries in doc/multi-agent-chat.md); its messageId doesn't survive a rebuild.
const MARKER = /(?:^|\n)⟦mpr(-dm)?:[^\s⟧]+ ([^\s⟧]+)⟧$/

/** A message the mypaseo-rooms plugin delivered into the agent's session, and when it sent it. */
export function deliveryOf(item: TimelineItem): { dm: boolean; at: string } | null {
  const m = item.type === 'user_message' ? MARKER.exec(item.text.trimEnd()) : null
  return m && { dm: !!m[1], at: m[2] }
}

const isRoomItem = (item: TimelineItem): item is Extract<TimelineItem, { type: 'plugin' }> =>
  item.type === 'plugin' && item.pluginId === 'mypaseo-rooms'

// A step, as chat/work.ts has it: the runs of them collapse into one row.
const isStep = (item: TimelineItem) => item.type === 'tool_call' || item.type === 'reasoning'

/**
 * A member's items with their sort times. A rebuilt timeline stamps every entry with the rebuild time, so an entry
 * stamped after the member's next delivery (before its first one, after the room's first item) keeps the sort time
 * before it: a turn sorts at the delivery that opened it, pre-room history before the room. Sort times never go down
 * along a timeline, and the lead's room items come first, so they win ties with the turns they open.
 *
 * A run of steps sorts with the item that ends it, so a member's thoughts and tool calls sit right above the reply they
 * led to, not among what the others wrote meanwhile; a running member's last run sorts last, under everything. A run
 * a new turn ends (an interrupted turn's) keeps its own time.
 */
function itemsOf({ agentId, handle, entries, running }: Member, lead: boolean): [number, RoomItem][] {
  const deliveries = entries.map(({ item }) => deliveryOf(item))
  const roomStart = lead ? Math.min(...entries.filter((e) => isRoomItem(e.item)).map((e) => Date.parse(e.timestamp))) : Infinity
  const cap: number[] = []
  for (let i = entries.length - 1, next = Infinity; i >= 0; i--) {
    cap[i] = next
    const d = deliveries[i]
    if (d) next = Date.parse(d.at)
  }
  const rooms: [number, RoomItem][] = []
  const rest: [number, RoomItem][] = []
  const seen = new Set<string>()
  let last = -Infinity
  let delivered = false
  let dm = false
  let steps: [number, RoomItem][] = [] // the run of steps waiting for the item that ends it
  entries.forEach(({ item, timestamp }, i) => {
    const t = Date.parse(timestamp)
    if (isRoomItem(item)) {
      if (!lead || seen.has(item.id)) return
      seen.add(item.id)
      const post = item.kind === 'room.post'
      const priv = post && (item.data as { dm?: boolean } | null)?.dm === true
      return void rooms.push([t, { item, timestamp, agentId, key: `room:${item.id}`, author: post ? 'user' : handle, private: priv }])
    }
    const user = item.type === 'user_message'
    const delivery = deliveries[i]
    if (user) dm = !!delivery?.dm
    if (delivery) {
      last = Math.max(last, Date.parse(delivery.at))
      delivered = true
      steps = []
      return
    }
    if (t <= cap[i] && (delivered || t <= roomStart)) last = Math.max(last, t)
    const entry: [number, RoomItem] = [last, { item, timestamp, agentId, key: `${agentId}:${i}`, author: user ? 'user' : handle, private: dm }]
    rest.push(entry)
    if (isStep(item)) return void steps.push(entry)
    if (!user) for (const s of steps) s[0] = last
    steps = []
  })
  if (running) for (const s of steps) s[0] = Infinity
  return [...rooms, ...rest]
}

/**
 * The room as one conversation in time order; ties keep the order of `members` (lead first) and of each timeline.
 * Deliveries are dropped (the lead's `room.post` items stand for the user's posts, agents' replies for theirs); a turn
 * opened by a direct delivery is private; messages typed in a member's own chat stay, by `user` on its timeline. The
 * lead's entries hold its room items, from `room.log` and its live timeline: one per id is kept.
 */
export function mergeRoom(members: Member[], leadId: string): RoomItem[] {
  return members
    .flatMap((m) => itemsOf(m, m.agentId === leadId))
    .sort((a, b) => a[0] - b[0] || 0) // || 0: two equal infinities give NaN
    .map(([, item]) => item)
}
