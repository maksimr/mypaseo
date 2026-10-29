import { Archive, Ban, Check, ChevronDown, ChevronRight, ShieldQuestion, Unlink, X } from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { clickable } from '../../a11y'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Spinner } from '../../components/Spinner'
import { errorText, type Agent } from '../../daemon'
import { archiveAgent, useDaemon, useHost } from '../../store'
import { useTimeline } from '../chat/useTimeline'
import { activity, type Activity } from './activity'
import { parentId } from './parent'
import { hide, useProviderSubagents, useSubagentTimeline } from './providers'
import { duration, paseoRow, providerRow, span, summary, took, type ProviderSubagent, type Row, type Status } from './rows'

type Open = { onOpenAgent?: (a: Agent) => void; onOpenProvider: (parentAgentId: string, subagentId: string) => void }

/** The agent's subagents at the bottom of its chat: the Paseo agents it started and its provider's own. */
export function Subagents({ agent, ...open }: { agent: Agent } & Open) {
  const { agents } = useHost()
  const own = agents.filter((a) => parentId(a) === agent.id)
  const provider = useProviderSubagents(agent.id, agent.status !== 'closed')
  return <Track parentAgentId={agent.id} cwd={agent.cwd} agents={own} provider={provider} {...open} />
}

/**
 * As Paseo desktop's subagents track: a head saying how many tasks went out, how many still run and for how long, that
 * opens a tree of them, each its state, task, time and latest step. A row opens the subagent: a Paseo agent's chat, a
 * provider subagent's tab. Archive Finished clears the done ones.
 */
export function Track({ parentAgentId, cwd, agents = [], provider, ...open }: { parentAgentId: string; cwd?: string; agents?: Agent[]; provider: ProviderSubagent[] } & Open) {
  const daemon = useDaemon()
  const items = useMemo(
    () => [...agents.map((a) => ({ row: paseoRow(a), agent: a })), ...provider.map((s) => ({ row: providerRow(s), agent: undefined }))].sort((x, y) => x.row.start.localeCompare(y.row.start)),
    [agents, provider],
  )
  const rows = items.map((x) => x.row)
  const [shown, setShown] = useState(true)
  const now = useNow(rows.some((r) => !r.end))
  if (!items.length) return null
  const head = summary(rows)
  const finished = items.filter((x) => x.row.end)
  const archiveFinished = () => {
    hide(daemon, parentAgentId, finished.filter((x) => !x.agent).map((x) => x.row.id))
    for (const { agent } of finished) if (agent) void archiveAgent(agent)
  }
  return (
    <div className="subagents">
      <div className="subagents-bar">
        <button className="subagents-head" aria-expanded={shown} onClick={() => setShown(!shown)}>
          <Mark status={head.status} />
          <span className="truncate">{head.text}</span>
          <span className="subagents-time">{duration(span(rows, now))}</span>
          <ChevronDown size={12} className="subagents-chevron" />
        </button>
        {finished.length > 0 && (
          <button className="icon-btn subagents-archive" title="Archive Finished" onClick={archiveFinished}>
            <Archive size={13} />
          </button>
        )}
      </div>
      {shown && (
        <div className="subagents-rows">
          {items.map(({ row, agent }) => (
            <SubagentRow key={row.id} row={row} now={now} onOpen={() => (agent ? open.onOpenAgent?.(agent) : open.onOpenProvider(parentAgentId, row.id))} actions={agent && <AgentActions agent={agent} />}>
              {agent ? <AgentActivity agent={agent} /> : <ProviderActivity parentAgentId={parentAgentId} subagentId={row.id} cwd={provider.find((s) => s.id === row.id)?.cwd ?? cwd} />}
            </SubagentRow>
          ))}
        </div>
      )}
    </div>
  )
}

/** Date.now, every second while `live`. */
function useNow(live: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  return now
}

function Mark({ status }: { status: Status }) {
  switch (status) {
    case 'running':
      return <Spinner size={13} aria-label="Running" />
    case 'input':
      return <ShieldQuestion size={13} color="var(--yellow)" aria-label="Needs your action" />
    case 'failed':
      return <X size={13} color="var(--red)" aria-label="Failed" />
    case 'canceled':
      return <Ban size={13} color="var(--text-faint)" aria-label="Canceled" />
    default:
      return <Check size={13} color="var(--green)" aria-label="Done" />
  }
}

/** What a stopped row says after its task. */
const ENDED: Partial<Record<Status, string>> = { done: 'done', failed: 'failed', canceled: 'canceled' }

/** Its mark, task, time and actions; under them, its identity and latest step. */
function SubagentRow({ row, now, onOpen, actions, children }: { row: Row; now: number; onOpen: () => void; actions?: ReactNode; children: ReactNode }) {
  const { providers } = useHost()
  const entry = providers.find((p) => p.provider === row.provider)
  const provider = entry?.label ?? row.provider
  const subtitle = entry?.models?.find((m) => m.id === row.subtitle)?.label ?? row.subtitle
  return (
    <div className={`subagent ${row.status}`} title={row.label} {...clickable(onOpen)}>
      <Mark status={row.status} />
      <span className="subagent-line">
        <span className="truncate">{row.label}</span>
        {ENDED[row.status] && <span className="subagent-ended">· {ENDED[row.status]}</span>}
        <span className="subagent-time">{duration(took(row, now))}</span>
        <ChevronRight size={12} className="subagent-chevron" />
      </span>
      <span className="subagent-actions">{actions}</span>
      <span className="subagent-meta">
        <span className="subagent-identity" title={[provider, subtitle].filter(Boolean).join(' · ')}>
          <ProviderIcon provider={row.provider} size={12} />
          <span className="truncate">{provider}{subtitle && <> · <span className="subagent-model">{subtitle}</span></>}</span>
        </span>
        {children}
      </span>
    </div>
  )
}

/** A Paseo subagent's Detach (it goes on as an agent of its own) and Archive. */
function AgentActions({ agent }: { agent: Agent }) {
  const daemon = useDaemon()
  const act = (run: () => void) => (e: MouseEvent) => {
    e.stopPropagation() // not a click on the row, which opens it
    run()
  }
  const detach = () => void daemon.detachAgent(agent.id).catch((e) => alert(`Could not detach agent: ${errorText(e)}`))
  const archive = () => {
    if (agent.status !== 'running' || confirm('Archive this subagent? It is still running.')) void archiveAgent(agent)
  }
  return (
    <>
      <button className="icon-btn" title="Detach" onClick={act(detach)}>
        <Unlink size={13} />
      </button>
      <button className="icon-btn" title="Archive" onClick={act(archive)}>
        <Archive size={13} />
      </button>
    </>
  )
}

function AgentActivity({ agent }: { agent: Agent }) {
  const { items } = useTimeline(agent.id)
  if (agent.pendingPermissions.length) return <span className="subagent-activity input truncate">Needs your permission</span>
  if (agent.status === 'error' && agent.lastError) return <span className="subagent-activity failed truncate">{agent.lastError}</span>
  return <ActivityLine activity={activity(items, agent.cwd)} />
}

function ProviderActivity({ parentAgentId, subagentId, cwd }: { parentAgentId: string; subagentId: string; cwd?: string | null }) {
  const { entries } = useSubagentTimeline(parentAgentId, subagentId, false)
  return <ActivityLine activity={entries && activity(entries.map((e) => e.item), cwd ?? undefined)} />
}

function ActivityLine({ activity: a }: { activity?: Activity }) {
  if (!a) return null
  return (
    <span className="subagent-activity truncate">
      {a.verb && `${a.verb} `}
      <span className={a.file ? 'subagent-file' : undefined}>{a.text}</span>
    </span>
  )
}
