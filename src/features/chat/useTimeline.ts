import { useEffect, useState } from 'react'
import { errorText, type TimelineItem } from '../../daemon'
import { useDaemon } from '../../store'
import { applyStreamItem } from './streamItems'

type Timeline = { items: TimelineItem[]; loading: boolean; error: string | null }

export function useTimeline(agentId: string | null) {
  const daemon = useDaemon()
  // Callers remount per agent (key), so initial state never needs resetting.
  const [tl, setTl] = useState<Timeline>({ items: [], loading: !!agentId, error: null })

  useEffect(() => {
    if (!agentId) return
    let alive = true
    let items: TimelineItem[] = []
    let lastSeq = 0
    let fetching = true
    let buffered: { seq?: number; item: TimelineItem }[] = []

    const apply = (seq: number | undefined, item: TimelineItem) => {
      // Events already covered by the fetched page carry seq <= lastSeq.
      if (seq !== undefined && seq <= lastSeq) return
      if (seq !== undefined) lastSeq = seq
      items = applyStreamItem(items, item)
    }

    const load = async () => {
      fetching = true
      const opts = { direction: 'tail', projection: 'projected' } as const
      // First load: the last 10 entries arrive well before a long timeline, so show them until it does.
      // Sent first so the daemon answers it first. Stream events stay buffered for the full page.
      if (!items.length)
        daemon.fetchAgentTimeline(agentId, { ...opts, limit: 10 }).then(
          (page) => alive && fetching && setTl({ items: page.entries.map((e) => e.item), loading: false, error: null }),
          () => {},
        )
      try {
        // limit 0 = the whole timeline.
        const page = await daemon.fetchAgentTimeline(agentId, { ...opts, limit: 0 })
        if (!alive) return
        items = page.entries.map((e) => e.item)
        lastSeq = page.endCursor?.seq ?? 0
        fetching = false
        buffered.forEach((b) => apply(b.seq, b.item))
        buffered = []
        setTl({ items, loading: false, error: null })
      } catch (e) {
        fetching = false
        if (alive) setTl((t) => ({ ...t, loading: false, error: errorText(e) }))
      }
    }

    const sub = daemon.subscribeAgentTimeline(agentId, (m) => {
      if (m.type !== 'agent_stream') return void load() // replacement / restored after reconnect / error
      const { event, seq } = m.payload
      if (event.type !== 'timeline') return
      if (fetching) buffered.push({ seq, item: event.item })
      else {
        apply(seq, event.item)
        setTl((t) => ({ ...t, items }))
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
