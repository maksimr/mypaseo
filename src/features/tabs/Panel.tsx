import { FileDiff, Files, Shapes, SquareTerminal } from 'lucide-react'
import { navigateRows } from '../../a11y'
import { Artifacts } from '../artifacts/Artifacts'
import { ChangesList } from '../changes/Changes'
import { CommitDetails } from '../git-graph/CommitGraph'
import { FileTree } from '../files/Files'
import { GitGraphIcon } from '../../components/icons'
import { TerminalList } from '../terminal/Terminal'
import type { Agent, Workspace } from '../../daemon'
import type { DiffState } from '../changes/useCheckoutDiff'
import type { useTerminals } from '../terminal/useTerminals'
import type { Tabs } from './useTabs'

export type PanelView = 'files' | 'changes' | 'graph' | 'terminals' | 'artifacts'

/** The right pane: Changes, Files, Git Graph (the picked commit), Terminals and Artifacts sections. */
export function Panel({
  tabs,
  workspace,
  isGit,
  view,
  onView,
  terms,
  diff,
  onOpenTerminals,
  onNewTerminal,
  onOpenArtifact,
  dismiss,
}: {
  tabs: Tabs
  workspace: Workspace
  isGit: boolean
  view: PanelView
  onView: (v: PanelView) => void
  terms: ReturnType<typeof useTerminals>
  diff: DiffState
  onOpenTerminals: () => void
  onNewTerminal: () => void
  onOpenArtifact: (agent: Agent, doc: string) => void
  dismiss: () => void
}) {
  const { tab, setTab, openChanges, openGraph, openFile, commit, setCommitTab, setCommitFocus, showChange } = tabs
  const cwd = workspace.workspaceDirectory
  return (
    // Focusable: before its rows load (Files), the pane itself takes the focus when it opens. Arrow keys browse the rows like a tree.
    <aside className="panel" tabIndex={-1} onKeyDown={navigateRows}>
      <div className="panel-tabs" role="toolbar" aria-label="File Panel">
        {isGit && (
          <button className={`panel-tab ${view === 'changes' ? 'on' : ''}`} title="Changes" onClick={openChanges}>
            <FileDiff size={14} /> <span className="truncate">Changes</span>
          </button>
        )}
        <button className={`panel-tab ${view === 'files' ? 'on' : ''}`} title="Files" onClick={() => onView('files')}>
          <Files size={14} /> <span className="truncate">Files</span>
        </button>
        {isGit && (
          <button className={`panel-tab ${view === 'graph' ? 'on' : ''}`} title="Git Graph" onClick={() => openGraph()}>
            <GitGraphIcon size={14} /> <span className="truncate">Git Graph</span>
          </button>
        )}
        <button className={`panel-tab ${view === 'terminals' ? 'on' : ''}`} title="Terminals" onClick={onOpenTerminals}>
          <SquareTerminal size={14} /> <span className="truncate">Terminals</span>
        </button>
        <button className={`panel-tab ${view === 'artifacts' ? 'on' : ''}`} title="Artifacts" onClick={() => onView('artifacts')}>
          <Shapes size={14} /> <span className="truncate">Artifacts</span>
        </button>
      </div>
      {view === 'terminals' ? (
        <TerminalList
          terminals={terms.terminals}
          activeId={tab.startsWith('term:') ? tab.slice('term:'.length) : undefined}
          onOpen={(id) => {
            setTab(`term:${id}`)
            dismiss()
          }}
          onNew={() => {
            onNewTerminal()
            dismiss()
          }}
        />
      ) : view === 'files' ? (
        <FileTree key={cwd} cwd={cwd} rootName={workspace.projectDisplayName} onOpen={openFile} activePath={tab.startsWith('file:') ? tab.slice(5) : undefined} />
      ) : view === 'artifacts' ? (
        <Artifacts
          workspaceId={workspace.id}
          onOpen={(agent, doc) => {
            onOpenArtifact(agent, doc)
            dismiss()
          }}
          onOpenTab={tabs.openArtifact}
        />
      ) : view === 'graph' && !commit ? (
        <div className="empty">Pick a commit in the graph to see its changes.</div>
      ) : view === 'graph' && commit ? (
        <CommitDetails
          key={commit}
          cwd={cwd}
          sha={commit}
          onPick={(path) => {
            setCommitTab(commit)
            setCommitFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }))
            setTab('commit')
            dismiss()
          }}
        />
      ) : (
        <ChangesList diff={diff} onPick={showChange} />
      )}
    </aside>
  )
}
