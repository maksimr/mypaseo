import { ChevronDown, FileCode, FileDiff, GitCommitHorizontal, History, Shapes, SquareTerminal, X } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import { clickable } from '../../a11y'
import { GitGraphIcon } from '../../components/icons'
import { ProviderIcon } from '../../components/ProviderIcon'
import type { Agent } from '../../daemon'
import { ContextToggle } from '../chat/ContextCard'
import { handleOf, isLead, roomId } from '../rooms/members'
import { formatCombo, useShortcut } from '../../keymap'
import { totals, type DiffState } from '../changes/useCheckoutDiff'
import type { useTerminals } from '../terminal/useTerminals'
import type { Tabs } from './useTabs'
import { useSlide } from './useSlide'

export function TabBar({
  tabs,
  chatTabs,
  agent,
  draftProvider,
  terms,
  diff,
  cwd,
  onOpenChat,
  onCloseAgent,
  onCloseTerminal,
}: {
  tabs: Tabs
  chatTabs: (Agent | undefined)[]
  agent: Agent | undefined
  draftProvider: string | undefined
  terms: ReturnType<typeof useTerminals>
  diff: DiffState
  cwd: string | undefined
  onOpenChat: (a?: Agent) => void
  onCloseAgent: (a: Agent) => void
  onCloseTerminal: (id: string) => void
}) {
  const { tab, setTab, changesTab, closeChanges, graphTab, graphPath, closeGraph, commitTab, closeCommit, files, closeFile, artifacts, closeArtifact } = tabs
  const closeAgentKey = useShortcut('closeAgent')
  const t = totals(diff.files)
  const slide = useSlide(tab === 'chat' ? `chat:${agent?.id}` : tab)
  // A room's other members show in its lead's chat: only the open one keeps a tab, named by its handle if untitled.
  const shown = chatTabs.filter((a) => !a || a === agent || isLead(a) || !chatTabs.some((x) => x && x.id === roomId(a)))
  const room = tab === 'chat' && !!agent && isLead(agent)
  return (
    <div className="tabbar" role="toolbar" aria-label="Tabs">
      {/* On phones, a popover listing every tab (the bar shows only the open one); picking one closes it. */}
      <div ref={slide} className="tabs" id="tab-list" popover="auto" onClick={(e) => e.currentTarget.hidePopover()}>
        {shown.map((a) => (
          <div key={a?.id ?? 'new'} className={`tab agent-tab ${tab === 'chat' && a === agent ? 'on' : ''}`} {...clickable(() => onOpenChat(a))}>
            <ProviderIcon provider={a ? a.provider : draftProvider} size={13} />
            <span className="truncate">{a ? a.title || (roomId(a) ? `@${handleOf(a, [])}` : 'Agent') : 'New agent'}</span>
            {a && (
              <button
                className="tab-close hover-swap"
                title={`Close (${formatCombo(closeAgentKey)})`}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseAgent(a)
                }}
              >
                <X size={12} />
              </button>
            )}
            {a?.status === 'running' && <Spinner size={13} className="status-mark" aria-label="Working" />}
          </div>
        ))}
        {terms.terminals.map((x) => (
          <div key={x.id} className={`tab ${tab === `term:${x.id}` ? 'on' : ''}`} {...clickable(() => setTab(`term:${x.id}`))}>
            <SquareTerminal size={13} />
            <span className="truncate">{x.title || x.name}</span>
            <button
              className="tab-close hover-swap"
              title={`Close (${formatCombo(closeAgentKey)})`}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTerminal(x.id)
              }}
            >
              <X size={12} />
            </button>
            {x.activity?.state === 'working' && <Spinner size={13} className="status-mark" aria-label="Working" />}
          </div>
        ))}
        {changesTab && (
          <div className={`tab ${tab === 'changes' ? 'on' : ''}`} {...clickable(() => setTab('changes'))}>
            <FileDiff size={13} />
            {/* one inline run so the smaller counters sit on the label's baseline */}
            <span>
              Changes{' '}
              <span className="stat">
                <span className="add">+{t.add}</span>
                <span className="del">−{t.del}</span>
              </span>
            </span>
            <button
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeChanges()
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        {graphTab && (
          <div className={`tab ${tab === 'graph' ? 'on' : ''}`} {...clickable(() => setTab('graph'))} title={graphPath}>
            {graphPath ? <History size={13} /> : <GitGraphIcon size={13} />}
            {graphPath ? (
              <span className="truncate">
                History <span className="faint">{graphPath.split('/').pop()}</span>
              </span>
            ) : (
              <span>Git Graph</span>
            )}
            <button
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeGraph()
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        {commitTab && (
          <div className={`tab ${tab === 'commit' ? 'on' : ''}`} {...clickable(() => setTab('commit'))}>
            <GitCommitHorizontal size={13} />
            <span>
              Commit <span className="faint mono">{commitTab.slice(0, 7)}</span>
            </span>
            <button
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeCommit()
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        {files.map((path) => (
          <div key={path} className={`tab ${tab === `file:${path}` ? 'on' : ''}`} {...clickable(() => setTab(`file:${path}`))} title={path}>
            <FileCode size={13} />
            <span className="truncate">{path.split('/').pop()}</span>
            <button
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeFile(path)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {artifacts.map((a) => (
          <div key={a.id} className={`tab ${tab === `art:${a.id}` ? 'on' : ''}`} {...clickable(() => setTab(`art:${a.id}`))} title={a.title}>
            <Shapes size={13} />
            <span className="truncate">{a.title}</span>
            <button
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeArtifact(a.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button className="icon-btn tab-list-btn" title="All Tabs" popoverTarget="tab-list">
        <ChevronDown size={15} />
      </button>
      {tab === 'chat' && (cwd || room) && <ContextToggle room={room} />}
    </div>
  )
}
