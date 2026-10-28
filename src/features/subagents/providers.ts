import type { SessionOutboundMessage } from '@getpaseo/protocol/messages'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { errorText, type DaemonClient } from '../../daemon'
import { useDaemon } from '../../store'
import { applyEntry, type Entry } from '../chat/streamItems'
import type { ProviderSubagent } from './rows'

type Update = Extract<SessionOutboundMessage, { type: 'agent.provider_subagents.update' }>['payload']

/** A subagent's timeline as far as it's loaded: its last entries (for its row's line) or all of them (`full`, its tab).
 *  `seq`, `epoch`: where it's up to, so the updates it already has are skipped. */
type Loaded = { parentAgentId: string; subagentId: string; entries: Entry[]; seq: number; epoch: string; full: boolean }

/** One per daemon client: the subagents by parent agent, and their loaded timelines by `key`. */
type Feed = {
  lists: Map<string, ProviderSubagent[]>
  /** Parents a track shows, and how many tracks. */
  shown: Map<string, number>
  timelines: Map<string, Loaded>
  errors: Map<string, string>
  loading: Set<string>
  /** Finished subagents Archive Finished took off their track (the daemon can't archive them); running again brings them back. */
  hidden: ReadonlySet<string>
}

/** Enough for its row's line: the latest step or message. */
const TAIL = 20

const feeds = new WeakMap<DaemonClient, Feed>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
const key = (parentAgentId: string, subagentId: string) => `${parentAgentId}/${subagentId}`

function feedOf(c: DaemonClient): Feed {
  const found = feeds.get(c)
  if (found) return found
  const feed: Feed = { lists: new Map(), shown: new Map(), timelines: new Map(), errors: new Map(), loading: new Set(), hidden: new Set() }
  feeds.set(c, feed)
  // The daemon doesn't replay updates across a reconnect: each (re)subscription reloads what's shown.
  c.observeEvents(['agent.provider_subagents.update']).subscribe({
    snapshot: () => {
      for (const parent of feed.shown.keys()) void list(c, feed, parent)
      for (const t of feed.timelines.values()) void load(c, feed, t.parentAgentId, t.subagentId, t.full, true)
    },
    update: (m) => {
      if (m.type === 'agent.provider_subagents.update') apply(c, feed, m.payload)
    },
  })
  return feed
}

function setList(feed: Feed, parentAgentId: string, subagents: ProviderSubagent[]) {
  feed.lists.set(parentAgentId, subagents)
  const back = subagents.filter((s) => s.status === 'running' && feed.hidden.has(key(parentAgentId, s.id)))
  if (back.length) feed.hidden = new Set([...feed.hidden].filter((k) => !back.some((s) => k === key(parentAgentId, s.id))))
}

async function list(c: DaemonClient, feed: Feed, parentAgentId: string) {
  if (c.getLastServerInfoMessage()?.features?.providerSubagents !== true) return
  try {
    setList(feed, parentAgentId, (await c.listProviderSubagents(parentAgentId)).subagents)
    emit()
  } catch {
    // Archived meanwhile, or disconnected: the next snapshot lists it again.
  }
}

/** Fetches the timeline unless it's loaded (`force`: again). Updates that arrive meanwhile are in what it fetches. */
async function load(c: DaemonClient, feed: Feed, parentAgentId: string, subagentId: string, full: boolean, force = false) {
  const k = key(parentAgentId, subagentId)
  const t = feed.timelines.get(k)
  if (feed.loading.has(k) || (!force && t && (t.full || !full))) return
  feed.loading.add(k)
  try {
    const page = await c.fetchProviderSubagentTimeline(parentAgentId, subagentId, { direction: 'tail', limit: full ? 0 : TAIL })
    const entries = page.rows.map(({ item, timestamp }) => ({ item, timestamp }))
    feed.timelines.set(k, { parentAgentId, subagentId, entries, seq: page.endCursor?.seq ?? 0, epoch: page.epoch, full })
    feed.errors.delete(k)
  } catch (e) {
    feed.errors.set(k, errorText(e))
  } finally {
    feed.loading.delete(k)
    emit()
  }
}

function apply(c: DaemonClient, feed: Feed, u: Update) {
  if (u.kind === 'upsert') {
    const s = u.subagent
    const subagents = feed.lists.get(s.parentAgentId)
    if (!subagents) return // no track shows its parent
    const i = subagents.findIndex((x) => x.id === s.id)
    setList(feed, s.parentAgentId, i < 0 ? [...subagents, s] : subagents.with(i, s))
  } else if (u.kind === 'remove') {
    const subagents = feed.lists.get(u.parentAgentId)
    if (subagents) feed.lists.set(u.parentAgentId, subagents.filter((s) => s.id !== u.subagentId))
    feed.timelines.delete(key(u.parentAgentId, u.subagentId))
  } else {
    const k = key(u.parentAgentId, u.subagentId)
    const t = feed.timelines.get(k)
    if (!t || feed.loading.has(k) || u.seq <= t.seq) return
    if (u.epoch !== t.epoch) return void load(c, feed, u.parentAgentId, u.subagentId, t.full, true) // its timeline was replaced
    feed.timelines.set(k, { ...t, seq: u.seq, entries: applyEntry(t.entries, { item: u.item, timestamp: u.timestamp }) })
  }
  emit()
}

const byStart = (a: ProviderSubagent, b: ProviderSubagent) => a.createdAt.localeCompare(b.createdAt)

/**
 * The agent's provider subagents, oldest first: its own, or those `parentSubagentId` started. Listed while `loaded`: a
 * closed agent has none, and listing them would resume it.
 */
export function useProviderSubagents(parentAgentId: string, loaded: boolean, parentSubagentId?: string) {
  const c = useDaemon()
  const feed = feedOf(c)
  useEffect(() => {
    if (!loaded) return
    const n = feed.shown.get(parentAgentId) ?? 0
    feed.shown.set(parentAgentId, n + 1)
    if (!n) void list(c, feed, parentAgentId)
    return () => {
      const left = (feed.shown.get(parentAgentId) ?? 1) - 1
      if (left) feed.shown.set(parentAgentId, left)
      else feed.shown.delete(parentAgentId)
    }
  }, [c, feed, parentAgentId, loaded])
  const subagents = useSyncExternalStore(subscribe, () => feed.lists.get(parentAgentId))
  const hidden = useSyncExternalStore(subscribe, () => feed.hidden)
  return useMemo(
    () => (subagents ?? []).filter((s) => (s.parentSubagentId ?? undefined) === parentSubagentId && !hidden.has(key(parentAgentId, s.id))).sort(byStart),
    [subagents, hidden, parentAgentId, parentSubagentId],
  )
}

export function useProviderSubagent(parentAgentId: string, subagentId: string | null | undefined) {
  const feed = feedOf(useDaemon())
  return useSyncExternalStore(subscribe, () => feed.lists.get(parentAgentId)?.find((s) => s.id === subagentId))
}

/** The subagent's timeline, live: its last entries, or all of them (`full`). Undefined until it loads. */
export function useSubagentTimeline(parentAgentId: string, subagentId: string, full: boolean) {
  const c = useDaemon()
  const feed = feedOf(c)
  const k = key(parentAgentId, subagentId)
  const t = useSyncExternalStore(subscribe, () => feed.timelines.get(k))
  const error = useSyncExternalStore(subscribe, () => feed.errors.get(k))
  useEffect(() => {
    if (!t || (full && !t.full)) void load(c, feed, parentAgentId, subagentId, full)
  }, [c, feed, t, full, parentAgentId, subagentId])
  return { entries: t && (full && !t.full ? undefined : t.entries), error }
}

/** Archive Finished for provider subagents: the daemon keeps them, so they only leave the track. */
export function hide(c: DaemonClient, parentAgentId: string, subagentIds: string[]) {
  const feed = feedOf(c)
  feed.hidden = new Set([...feed.hidden, ...subagentIds.map((id) => key(parentAgentId, id))])
  emit()
}
