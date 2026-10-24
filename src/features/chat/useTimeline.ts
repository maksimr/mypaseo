import { useEffect, useState } from 'react'
import { errorText, type TimelineItem } from '../../daemon'
import { useDaemon } from '../../store'
import { applyEntry, type Entry } from './streamItems'

/** partial: only the first, tail page is in yet. times[i]: when items[i] was stamped (a streamed one: its last chunk). */
type Timeline = { items: TimelineItem[]; times: string[]; loading: boolean; error: string | null; partial?: boolean }

const split = (entries: Entry[]) => ({ items: entries.map((e) => e.item), times: entries.map((e) => e.timestamp) })

export function useTimeline(agentId: string | null) {
  const daemon = useDaemon()
  // Callers remount per agent (key), so initial state never needs resetting.
  const [tl, setTl] = useState<Timeline>({ items: [], times: [], loading: !!agentId, error: null })

  useEffect(() => {
    if (!agentId) return
    let alive = true
    let entries: Entry[] = []
    let lastSeq = 0
    let fetching = true
    let buffered: (Entry & { seq?: number })[] = []

    const apply = ({ seq, ...e }: Entry & { seq?: number }) => {
      // Events already covered by the fetched page carry seq <= lastSeq.
      if (seq !== undefined && seq <= lastSeq) return
      if (seq !== undefined) lastSeq = seq
      entries = applyEntry(entries, e)
    }

    const load = async () => {
      fetching = true
      const opts = { direction: 'tail', projection: 'projected' } as const
      // First load: the last 10 entries arrive well before a long timeline, so show them until it does.
      // Sent first so the daemon answers it first. Stream events stay buffered for the full page.
      if (!entries.length)
        daemon.fetchAgentTimeline(agentId, { ...opts, limit: 10 }).then(
          (page) => alive && fetching && setTl({ ...split(page.entries), loading: false, error: null, partial: true }),
          () => {},
        )
      try {
        // limit 0 = the whole timeline.
        const page = await daemon.fetchAgentTimeline(agentId, { ...opts, limit: 0 })
        if (!alive) return
        entries = page.entries.map(({ item, timestamp }) => ({ item, timestamp }))
        lastSeq = page.endCursor?.seq ?? 0
        fetching = false
        buffered.forEach(apply)
        buffered = []
        setTl({ ...split(entries), loading: false, error: null })
      } catch (e) {
        fetching = false
        if (alive) setTl((t) => ({ ...t, loading: false, error: errorText(e) }))
      }
    }

    const sub = daemon.subscribeAgentTimeline(agentId, (m) => {
      if (m.type !== 'agent_stream') return void load() // replacement / restored after reconnect / error
      const { event, seq, timestamp } = m.payload
      if (event.type !== 'timeline') return
      if (fetching) buffered.push({ seq, item: event.item, timestamp })
      else {
        apply({ seq, item: event.item, timestamp })
        setTl((t) => ({ ...t, ...split(entries) }))
      }
    })
    sub.ready.then(load, load)
    return () => {
      alive = false
      void sub.release().catch(() => {})
    }
  }, [daemon, agentId])

  return tl
}
