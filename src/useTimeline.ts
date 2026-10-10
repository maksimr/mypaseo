import { useCallback, useEffect, useRef, useState } from 'react'
import { daemon, errorText, type TimelineItem, type TimelinePage } from './daemon'
import { applyStreamItem } from './timeline'

type Cursor = TimelinePage['startCursor']
type Timeline = { items: TimelineItem[]; hasOlder: boolean; loading: boolean; error: string | null }

const PAGE = 150

export function useTimeline(agentId: string | null) {
  // Callers remount per agent (key), so initial state never needs resetting.
  const [tl, setTl] = useState<Timeline>({ items: [], hasOlder: false, loading: !!agentId, error: null })
  const start = useRef<Cursor>(null)

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
      try {
        const page = await daemon.fetchAgentTimeline(agentId, { direction: 'tail', limit: PAGE, projection: 'projected' })
        if (!alive) return
        items = page.entries.map((e) => e.item)
        lastSeq = page.endCursor?.seq ?? 0
        start.current = page.startCursor
        fetching = false
        buffered.forEach((b) => apply(b.seq, b.item))
        buffered = []
        setTl({ items, hasOlder: page.hasOlder, loading: false, error: null })
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
  }, [agentId])

  const loadOlder = useCallback(async () => {
    if (!agentId || !start.current) return
    const page = await daemon.fetchAgentTimeline(agentId, {
      direction: 'before',
      cursor: start.current,
      limit: PAGE,
      projection: 'projected',
    })
    start.current = page.startCursor
    setTl((t) => ({ ...t, items: [...page.entries.map((e) => e.item), ...t.items], hasOlder: page.hasOlder }))
  }, [agentId])

  return { ...tl, loadOlder }
}
