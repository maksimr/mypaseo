import { useEffect, useMemo, useState } from 'react'
import { errorText, type DaemonClient, type TimelineItem } from '../../daemon'
import * as rooms from '../../rooms'
import { mergeRoom } from '../rooms/roomView'
import { useDaemon } from '../../store'
import { applyStreamItem } from './streamItems'

type Entry = { item: TimelineItem; timestamp: string }
type Event = { seq?: number; item: TimelineItem; timestamp: string }

/** applyStreamItem on entries: an entry it adds or changes takes the event's time, as the daemon stamps fetched ones. */
const applyEntry = (entries: Entry[], { item, timestamp }: Event) =>
  applyStreamItem(entries.map((e) => e.item), item).map((it, i) => (it === entries[i]?.item ? entries[i] : { item: it, timestamp }))

const isRoomItem = (item: TimelineItem) => item.type === 'plugin' && item.pluginId === 'mypaseo-rooms'

/** Follows an agent's whole timeline with its entries' times, as useTimeline follows its items. `load` runs before
 *  every (re)load: on subscribing, and after a replacement or a reconnect; `live` on every streamed item. */
function follow(
  daemon: DaemonClient,
  agentId: string,
  on: { entries: (e: Entry[]) => void; error: (e: string) => void; load?: () => void; live?: (item: TimelineItem) => void },
) {
  let alive = true
  let entries: Entry[] = []
  let lastSeq = 0
  let pending: Event[] | null = [] // events held while a load runs
  const apply = (e: Event) => {
    if (e.seq !== undefined && e.seq <= lastSeq) return // the fetched page has it
    if (e.seq !== undefined) lastSeq = e.seq
    entries = applyEntry(entries, e)
  }
  const load = async () => {
    pending ??= []
    on.load?.()
    try {
      const page = await daemon.fetchAgentTimeline(agentId, { direction: 'tail', projection: 'projected', limit: 0 })
      if (!alive) return
      entries = page.entries.map(({ item, timestamp }) => ({ item, timestamp }))
      lastSeq = page.endCursor?.seq ?? 0
      const held = pending ?? []
      pending = null
      held.forEach(apply)
      on.entries(entries)
    } catch (e) {
      pending = null
      if (alive) on.error(errorText(e))
    }
  }
  const sub = daemon.subscribeAgentTimeline(agentId, (m) => {
    if (m.type !== 'agent_stream') return void load()
    const { event, seq, timestamp } = m.payload
    if (event.type !== 'timeline') return
    on.live?.(event.item)
    if (pending) return void pending.push({ seq, item: event.item, timestamp })
    apply({ seq, item: event.item, timestamp })
    on.entries(entries)
  })
  sub.ready.then(load, load)
  return () => {
    alive = false
    void sub.release().catch(() => {})
  }
}

/**
 * A room as one conversation (mergeRoom): every member's timeline, followed live, and the room items. `members` lists
 * the lead (`roomId`) first; null shows nothing. `items[i]` is `room[i].item`.
 *
 * The room items come from the room log only, reloaded whenever one streams in on the lead: a rebuilt timeline drops
 * them, and the log has the times the plugin works with (the streamed copy is stamped a few ms later). Leaving them out
 * of the lead's timeline keeps its entries' keys (their index) stable as the log grows.
 */
export function useRoomTimeline(roomId: string | null, members: { agentId: string; handle: string }[]) {
  const daemon = useDaemon()
  const [timelines, setTimelines] = useState<Record<string, Entry[]>>({})
  const [log, setLog] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const ids = members.map((m) => m.agentId).join()
  useEffect(() => {
    if (!roomId) return
    let asked = 0 // only the latest answer counts
    const loadLog = () => {
      const n = ++asked
      rooms.log(daemon, { roomId }).then(
        ({ items }) =>
          n === asked &&
          setLog(items.map(({ id, kind, data, timestamp }) => ({ item: { type: 'plugin', pluginId: 'mypaseo-rooms', version: 1, id, kind, data: data as never }, timestamp }))),
        (e) => n === asked && setError(errorText(e)),
      )
    }
    // shortcut: a member joining or leaving refetches every member's timeline; follow each on its own if rooms get big.
    const stops = ids.split(',').map((id) =>
      follow(daemon, id, {
        entries: (entries) => setTimelines((t) => ({ ...t, [id]: id === roomId ? entries.filter((e) => !isRoomItem(e.item)) : entries })),
        error: setError,
        ...(id === roomId && { load: loadLog, live: (item: TimelineItem) => isRoomItem(item) && loadLog() }),
      }),
    )
    return () => {
      asked = -1
      stops.forEach((stop) => stop())
    }
  }, [daemon, roomId, ids])
  const handles = members.map((m) => m.handle).join()
  const room = useMemo(
    () => (roomId ? mergeRoom(members.map((m) => ({ ...m, entries: [...(timelines[m.agentId] ?? []), ...(m.agentId === roomId ? log : [])] })), roomId) : []),
    [roomId, ids, handles, timelines, log], // eslint-disable-line react-hooks/exhaustive-deps -- members, by its ids and handles
  )
  const items = useMemo(() => room.map((r) => r.item), [room])
  return { items, room, loading: !error && members.some((m) => !timelines[m.agentId]), error }
}
