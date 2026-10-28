import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { parseNear } from '../../components/Markdown'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Loading, Spinner } from '../../components/Spinner'
import type { Agent } from '../../daemon'
import { useHost } from '../../store'
import { Timeline } from '../chat/Timeline'
import { useProviderSubagent, useProviderSubagents, useSubagentTimeline } from './providers'
import { providerRow } from './rows'
import { Track } from './Subagents'
import { BackToParent } from './TabBack'

type Props = { parentAgentId: string; subagentId: string }

/** A provider subagent's conversation, read-only, in a tab of its own; the subagents it started on a track at its end. */
export function SubagentView({ parentAgentId, subagentId, cwd, onOpenProvider }: Props & { cwd?: string; onOpenProvider: (parentAgentId: string, subagentId: string) => void }) {
  const { entries, error } = useSubagentTimeline(parentAgentId, subagentId, true)
  const items = useMemo(() => entries?.map((e) => e.item) ?? [], [entries])
  const times = useMemo(() => entries?.map((e) => e.timestamp), [entries])
  const children = useProviderSubagents(parentAgentId, true, subagentId)
  // Sticks to the bottom while it streams, unless scrolled up.
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
    parseNear(el)
  }, [items])
  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        tabIndex={-1}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {!entries && !error && <Loading />}
        {error && <div className="empty err">{error}</div>}
        <Timeline items={items} members={[]} times={times}>
          <Track parentAgentId={parentAgentId} cwd={cwd} provider={children} onOpenProvider={onOpenProvider} />
        </Timeline>
      </div>
    </div>
  )
}

/**
 * A subagent tab's back to its parent (the subagent that started it, else the agent) and name, then `children` (its
 * close button), then a spinner while it runs.
 */
export function SubagentTab({
  parentAgentId,
  subagentId,
  onOpenAgent,
  onOpenProvider,
  children,
}: Props & { onOpenAgent: (a: Agent) => void; onOpenProvider: (parentAgentId: string, subagentId: string) => void; children: ReactNode }) {
  const { agents } = useHost()
  const s = useProviderSubagent(parentAgentId, subagentId)
  const up = useProviderSubagent(parentAgentId, s?.parentSubagentId)
  const agent = agents.find((a) => a.id === parentAgentId)
  return (
    <>
      {up ? (
        <BackToParent label={providerRow(up).label} onBack={() => onOpenProvider(parentAgentId, up.id)} />
      ) : agent ? (
        <BackToParent label={agent.title || 'Agent'} onBack={() => onOpenAgent(agent)} />
      ) : (
        <ProviderIcon provider={s?.provider} size={13} />
      )}
      <span className="truncate">{s ? providerRow(s).label : 'Subagent'}</span>
      {children}
      {s?.status === 'running' && <Spinner size={13} className="status-mark" aria-label="Working" />}
    </>
  )
}
