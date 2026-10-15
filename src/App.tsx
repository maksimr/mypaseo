import { ChevronDown, FileCode, FileDiff, Files, GitCommitHorizontal, History, Loader2, PanelLeft, PanelRight, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ActiveViewContext } from './activeView'
import { ChangesList, ChangesView } from './components/Changes'
import { Chat } from './components/Chat'
import type { Target } from './components/target'
import { CommandPalette } from './components/CommandPalette'
import { CommitDetails, CommitGraph } from './components/CommitGraph'
import { FileTree, FileView } from './components/Files'
import { ImportSession } from './components/ImportSession'
import { OpenInEditor } from './components/OpenInEditor'
import { ProviderIcon } from './components/ProviderIcon'
import { Settings, type Section } from './components/Settings'
import { Sidebar, type Selection } from './components/Sidebar'
import { TerminalList, TerminalView } from './components/Terminal'
import { errorText, type Agent, type Workspace } from './daemon'
import { formatCombo, isShortcut, useShortcut } from './keymap'
import { useAttentionNotifications } from './notifications'
import { OpenFileContext } from './openFile'
import { selectionRef } from './selection'
import { SelectionAction } from './components/SelectionAction'
import { revealComment, reviewKey, startComment, type ReviewComment } from './review'
import { clickable } from './a11y'
import { archiveAgent, archiveWorkspace, byRecent, HostContext, projectName, sidebarWorkspaces, startSync, useStore } from './store'
import { useEdgeSwipe } from './swipe'
import { useTabStatus } from './tabStatus'
import { totals, useCheckoutDiff, useCommitDiff } from './useCheckoutDiff'
import { useTerminals } from './useTerminals'

type Tab = 'chat' | 'changes' | 'graph' | 'commit' | `file:${string}` | `term:${string}`

/** Zed's git graph glyph (lucide has none): a commit with a branch off to the right. Sized and stroked like lucide icons. */
const GitGraphIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <circle cx="6" cy="6" r="3" />
    <path d="M6 9v12" />
    <circle cx="18" cy="15" r="3" />
    <path d="M18 18v3M15 15h-4a5 5 0 0 1-5-5" />
  </svg>
)

const MIN_W = 180
const MAX_W = 600
/** Below this (tablet portrait) the side panes overlay the center; wider keeps three columns. Same query as index.css. */
const NARROW = '(width < 900px)'

/** Pane width in px, persisted to localStorage[key]. */
function useWidth(key: string, initial: number) {
  const [w, setW] = useState(() => Number(localStorage[key]) || initial)
  const set = (v: number) => {
    const c = Math.round(Math.min(Math.max(v, MIN_W), MAX_W))
    setW(c)
    localStorage[key] = c
  }
  return [w, set] as const
}

/** Drag handle on the inner edge of a side pane; arrow keys resize too. */
function Resizer({ side, label, width, onResize }: { side: 'left' | 'right'; label: string; width: number; onResize: (w: number) => void }) {
  return (
    <div
      className={`resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault() // no text selection while dragging
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(side === 'left' ? e.clientX : window.innerWidth - e.clientX)
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0
        if (!d) return
        e.preventDefault()
        onResize(width + (side === 'left' ? d : -d))
      }}
    />
  )
}

export default function App() {
  useEffect(() => startSync(), [])
  const { hosts, byHost, projects, workspaces, agents, pinned } = useStore()

  const [sel, setSel] = useState<Selection>(() => JSON.parse(localStorage.mypaseoSelection ?? '{}'))
  // The agent selection a "New agent" composer was opened from, so Ctrl+W on the composer returns there.
  const [back, setBack] = useState<Selection>()
  const select = (s: Selection) => {
    setSel(s)
    setBack(s.agentId ? undefined : sel.agentId ? sel : back)
    localStorage.mypaseoSelection = JSON.stringify(s)
  }
  const openWorkspace = (w: Workspace) =>
    select({ projectId: w.projectId, workspaceId: w.id, agentId: agents.filter((a) => a.workspaceId === w.id).sort(byRecent)[0]?.id })
  const [activeOnly, setActiveOnly] = useState(() => localStorage.mypaseoActiveOnly === 'true')
  const listed = () => sidebarWorkspaces(projects, workspaces, agents, pinned, activeOnly, sel.workspaceId)
  /** Archives or removes a workspace; if it was selected, selects the one above it in the sidebar. */
  const archive = async (w: Workspace, deleteAgents: boolean) => {
    const list = listed()
    const i = list.findIndex((x) => x.id === w.id)
    const near = list[i - 1] ?? list[i + 1] // the first one has none above: take the one below
    if (!(await archiveWorkspace(w, deleteAgents)) || sel.workspaceId !== w.id) return
    if (near) openWorkspace(near)
    else select({ projectId: w.projectId })
  }
  /** Archives an agent; if it was selected, selects the next one in its workspace (or the composer). */
  const closeAgent = async (a: Agent) => {
    const list = agents.filter((x) => x.workspaceId === a.workspaceId).sort(byRecent)
    const i = list.findIndex((x) => x.id === a.id)
    const near = list[i + 1] ?? list[i - 1]
    if (!(await archiveAgent(a)) || sel.agentId !== a.id) return
    select({ ...sel, agentId: near?.id })
  }
  const workspace = workspaces.find((w) => w.id === sel.workspaceId)
  const project = projects.find((p) => p.projectId === (workspace?.projectId ?? sel.projectId))
  // The selection's host; with nothing selected (or still loading), the first one.
  const hostId = (workspace ?? project)?.hostId ?? hosts[0].id
  const agent = agents.find((a) => a.id === sel.agentId)
  // One chat tab per workspace agent, in sidebar order; undefined is the "New agent" composer.
  const wsAgents = workspace ? agents.filter((a) => a.workspaceId === workspace.id).sort(byRecent) : []
  const chatTabs = wsAgents.some((a) => a.id === agent?.id) ? wsAgents : [agent, ...wsAgents]
  const openChat = (a?: Agent) => {
    if (target) select({ projectId: target.projectId, workspaceId: workspace?.id, agentId: a?.id })
    setTab('chat')
  }
  useAttentionNotifications(sel.agentId, (agentId) => {
    const w = workspaces.find((x) => x.id === agents.find((a) => a.id === agentId)?.workspaceId)
    if (w) select({ projectId: w.projectId, workspaceId: w.id, agentId })
  })
  const target: Target | null = workspace
    ? { projectId: workspace.projectId, name: workspace.projectDisplayName, rootPath: workspace.projectRootPath, workspace }
    : project
      ? { projectId: project.projectId, name: projectName(project), rootPath: project.projectRootPath }
      : null
  useTabStatus(agent?.title || workspace?.title || workspace?.name || target?.name, agents)
  const projectId = project?.projectId
  const cwd = workspace?.workspaceDirectory
  const isGit = workspace?.projectKind === 'git'

  const [tab, setTab] = useState<Tab>('chat')
  const [visited, setVisited] = useState<string[]>([]) // views shown since the workspace opened, in that order
  const [files, setFiles] = useState<string[]>([])
  // undefined: shown while the workspace has changes; true/false: the user opened or closed it.
  const [changesPick, setChangesPick] = useState<boolean>()
  const [graphTab, setGraphTab] = useState(false)
  const [graphPath, setGraphPath] = useState<string>() // set: the graph tab shows this file's history
  const [commit, setCommit] = useState<string>() // picked in the git graph, shown in the panel
  const [commitTab, setCommitTab] = useState<string>() // the commit whose diff the 'commit' tab shows
  const [commitFocus, setCommitFocus] = useState<{ path: string; n: number } | null>(null)
  const [panel, setPanel] = useState<'files' | 'changes' | 'graph' | 'terminals' | null>(() => JSON.parse(localStorage.mypaseoPanel ?? 'null'))
  const panelView = isGit || panel === 'terminals' ? (panel ?? 'changes') : 'files' // closed: what a swipe slides in
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null)
  const [settings, setSettings] = useState<{ hostId: string; section?: Section } | null>(null)
  const [palette, setPalette] = useState(false)
  const [chatText, setChatText] = useState('') // handed to the composer when the chat tab mounts
  const [sidebar, setSidebar] = useState(() => localStorage.mypaseoSidebar !== 'false')
  useEffect(() => {
    localStorage.mypaseoSidebar = sidebar
    localStorage.mypaseoPanel = JSON.stringify(panel)
    localStorage.mypaseoActiveOnly = activeOnly
  }, [sidebar, panel, activeOnly])
  /** On narrow windows, picking something in an overlaid pane closes the panes, like a drawer. */
  const dismiss = () => {
    if (!matchMedia(NARROW).matches) return
    setSidebar(false)
    setPanel(null)
  }
  // Touch: dragging in from the left edge slides out the sidebar, from the right edge the file panel;
  // on narrow windows, dragging an open one toward its edge slides it back.
  const appRef = useRef<HTMLDivElement>(null)
  const swipe = useEdgeSwipe(
    appRef,
    (side) => (side === 'left' ? !sidebar : !!cwd && !panel),
    () => matchMedia(NARROW).matches,
    (side, open) => (side === 'left' ? setSidebar(open) : setPanel((p) => (open ? (p ?? 'changes') : null))),
  )
  const [sidebarW, setSidebarW] = useWidth('mypaseoSidebarWidth', 270)
  const [panelW, setPanelW] = useWidth('mypaseoPanelWidth', 320) // room for the Changes, Files and Git Graph tabs
  const sidebarKey = useShortcut('toggleSidebar')
  const panelKey = useShortcut('togglePanel')
  const closeAgentKey = useShortcut('closeAgent')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isShortcut(e, 'commandPalette')) {
        e.preventDefault()
        setPalette((p) => !p)
      }
      if (isShortcut(e, 'toggleSidebar')) {
        e.preventDefault()
        setSidebar((s) => !s)
      }
      if (isShortcut(e, 'toggleActiveOnly')) {
        e.preventDefault()
        setActiveOnly((a) => !a)
      }
      if (cwd && isShortcut(e, 'togglePanel')) {
        e.preventDefault()
        setPanel((p) => (p ? null : 'changes'))
      }
      if (isGit && isShortcut(e, 'openChanges')) {
        e.preventDefault()
        openChanges()
      }
      if (isGit && isShortcut(e, 'openGraph')) {
        e.preventDefault()
        openGraph()
      }
      const tabStep = isShortcut(e, 'nextTab') ? 1 : isShortcut(e, 'prevTab') ? -1 : 0
      if (target && tabStep) {
        e.preventDefault()
        const tabs: (Tab | Agent | undefined)[] = [
          ...chatTabs,
          ...terms.terminals.map((t) => `term:${t.id}` as const),
          ...(changesTab ? ['changes' as const] : []),
          ...(graphTab ? ['graph' as const] : []),
          ...(commitTab ? ['commit' as const] : []),
          ...files.map((p) => `file:${p}` as const),
        ]
        const next = tabs[(tabs.indexOf(tab === 'chat' ? agent : tab) + tabStep + tabs.length) % tabs.length]
        if (typeof next === 'string') setTab(next)
        else openChat(next)
      }
      const composer = tab === 'chat' && !agent
      if (target && isShortcut(e, 'closeAgent') && (!composer || agents.some((a) => a.id === back?.agentId))) {
        e.preventDefault()
        if (composer) select(back!)
        else if (tab === 'chat') void closeAgent(agent!)
        else if (tab === 'changes') closeChanges()
        else if (tab === 'graph') closeGraph()
        else if (tab === 'commit') closeCommit()
        else if (tab.startsWith('term:')) closeTerminal(tab.slice('term:'.length))
        else closeFile(tab.slice('file:'.length))
      }
      if (workspace && isShortcut(e, 'newTerminal')) {
        e.preventDefault()
        void newTerminal()
      }
      if (projectId && isShortcut(e, 'newWorkspace')) {
        e.preventDefault()
        select({ projectId })
      }
      if (workspace && isShortcut(e, 'newAgent')) {
        e.preventDefault()
        openChat()
      }
      const s = target && isShortcut(e, 'addToChat') && selectionRef()
      if (s) {
        e.preventDefault()
        addToChat(s.ref)
      }
      if (isShortcut(e, 'openSettings')) {
        e.preventDefault()
        setSettings({ hostId })
      }
      if (workspace && isShortcut(e, 'archiveWorkspace')) {
        e.preventDefault()
        void archive(workspace, false)
      }
      if (workspace && isShortcut(e, 'removeWorkspace')) {
        e.preventDefault()
        void archive(workspace, true)
      }
      const step = isShortcut(e, 'nextWorkspace') ? 1 : isShortcut(e, 'prevWorkspace') ? -1 : 0
      if (step) {
        const list = listed()
        const i = list.findIndex((w) => w.id === sel.workspaceId)
        // Wraps around; with no workspace selected, next lands on the first and previous on the last.
        const w = list[((i < 0 && step < 0 ? 0 : i) + step + list.length) % list.length]
        if (!w) return
        e.preventDefault()
        openWorkspace(w)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // reads most of the render's state, so it re-binds every render
  const [importTarget, setImportTarget] = useState<Target | null>(null)
  // Provider the "New agent" composer will use, for its tab icon.
  const [draftProvider, setDraftProvider] = useState<string>()
  const diff = useCheckoutDiff(hostId, isGit ? cwd : undefined)
  const commitDiff = useCommitDiff(hostId, isGit ? cwd : undefined, commitTab)
  const t = totals(diff.files)
  // Loading keeps it open while the diff arrives; an empty diff (all committed) closes it.
  const changesTab = changesPick ?? (isGit && (diff.files.length > 0 || (diff.loading && tab === 'changes')))
  if (tab === 'changes' && !changesTab) setTab('chat')
  const terms = useTerminals(hostId, workspace)
  // A terminal whose shell exited leaves the list.
  if (tab.startsWith('term:') && terms.loaded && !terms.terminals.some((x) => `term:${x.id}` === tab)) setTab('chat')

  // Tabs belong to a workspace: while rendering, stash the old one's and restore the new one's when the workspace changes.
  // Keyed by id, not directory: workspaces can share a checkout.
  const [tabsWs, setTabsWs] = useState(sel.workspaceId)
  const [savedTabs, setSavedTabs] = useState(
    new Map<string | undefined, { tab: Tab; files: string[]; changesPick?: boolean; graphTab: boolean; graphPath?: string; commit?: string; commitTab?: string }>(),
  )
  if (tabsWs !== sel.workspaceId) {
    setSavedTabs(new Map(savedTabs).set(tabsWs, { tab, files, changesPick, graphTab, graphPath, commit, commitTab }))
    const s = savedTabs.get(sel.workspaceId)
    setTabsWs(sel.workspaceId)
    setFiles(s?.files ?? [])
    setChangesPick(s?.changesPick)
    setGraphTab(s?.graphTab ?? false)
    setGraphPath(s?.graphPath)
    setCommit(s?.commit)
    setCommitTab(s?.commitTab)
    setTab(s?.tab ?? 'chat')
    setVisited([])
  }

  const openFile = (path: string) => {
    setFiles((f) => (f.includes(path) ? f : [...f, path]))
    setTab(`file:${path}`)
    dismiss()
  }
  // A panel section also opens its center tab: the diff for Changes, the graph for Git Graph (whose section shows the picked commit).
  const openChanges = () => {
    setPanel('changes')
    setChangesPick(true)
    setTab('changes')
  }
  const openGraph = (path?: string) => {
    setPanel('graph')
    setGraphTab(true)
    setGraphPath(path)
    setTab('graph')
  }
  const closeChanges = () => {
    setChangesPick(false)
    if (tab === 'changes') setTab('chat')
  }
  const closeGraph = () => {
    setGraphTab(false)
    if (tab === 'graph') setTab('chat')
  }
  const closeCommit = () => {
    setCommitTab(undefined)
    if (tab === 'commit') setTab(graphTab ? 'graph' : 'chat')
  }
  const closeFile = (path: string) => {
    setFiles((f) => f.filter((p) => p !== path))
    if (tab === `file:${path}`) setTab('chat')
  }
  const newTerminal = async () => {
    try {
      setTab(`term:${(await terms.create()).id}`)
    } catch (e) {
      alert(`Could not open terminal: ${errorText(e)}`)
    }
  }
  /** Like openGraph: shows the Terminals section and a terminal tab, starting a terminal when the workspace has none. */
  const openTerminals = () => {
    setPanel('terminals')
    if (!terms.loaded || tab.startsWith('term:')) return
    if (terms.terminals[0]) setTab(`term:${terms.terminals[0].id}`)
    else void newTerminal()
  }
  /** Closing a terminal tab stops its shell, like in Paseo desktop. */
  const closeTerminal = (id: string) => {
    terms.kill(id).catch((e) => alert(`Could not close terminal: ${errorText(e)}`))
    if (tab === `term:${id}`) setTab('chat')
  }
  const addToChat = (ref: string) => {
    setChatText((t) => `${t}${t ? ' ' : ''}${ref} `)
    setTab('chat')
  }
  const showChange = (path: string) => {
    setChangesPick(true)
    setTab('changes')
    setFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }))
    dismiss()
  }
  // The diff when it shows the comment's line, else the file.
  const showComment = (c: ReviewComment) => {
    revealComment(c.id)
    const inDiff = diff.files
      .find((f) => f.path === c.path)
      ?.hunks.some((h) => (c.side === 'old' ? c.line >= h.oldStart && c.line < h.oldStart + h.oldCount : c.line >= h.newStart && c.line < h.newStart + h.newCount))
    if (!inDiff) return openFile(c.path)
    setFocus(null) // its scroll to the file's top would undo the one to the comment
    setChangesPick(true)
    setTab('changes')
    dismiss()
  }

  const chatKey = (a?: Agent) => `chat:${a?.id ?? `${target?.projectId}/${workspace?.id}`}`
  /** A tab's view by key (`tab`, or chatKey for chats); null once the tab is closed. */
  const view = (k: string): ReactNode => {
    if (!target) return null
    if (k === 'changes') return changesTab && cwd ? <ChangesView cwd={cwd} diff={diff} focus={focus} onOpenFile={openFile} /> : null
    if (k === 'graph')
      return graphTab && workspace ? (
        <CommitGraph
          key={graphPath}
          workspace={workspace}
          files={diff.files}
          path={graphPath}
          selected={commit}
          onSelect={(sha) => {
            setCommit(sha)
            setPanel('graph')
          }}
        />
      ) : null
    if (k === 'commit') return commitTab && cwd ? <ChangesView key={commitTab} cwd={cwd} diff={commitDiff} focus={commitFocus} onOpenFile={openFile} readOnly /> : null
    if (k.startsWith('term:'))
      return k === tab || terms.terminals.some((x) => `term:${x.id}` === k) ? <TerminalView terminalId={k.slice('term:'.length)} /> : null
    if (k.startsWith('file:')) {
      const path = k.slice('file:'.length)
      return files.includes(path) && cwd ? <FileView cwd={cwd} path={path} onHistory={isGit ? () => openGraph(path) : undefined} /> : null
    }
    const i = chatTabs.findIndex((a) => chatKey(a) === k)
    if (i < 0) return null
    const a = chatTabs[i]
    return (
      <Chat
        agent={a}
        target={target}
        onCreated={(a) => select({ projectId: target.projectId, workspaceId: a.workspaceId, agentId: a.id })}
        onImport={() => setImportTarget(target)}
        initialText={a === agent ? chatText : ''}
        onInitialTextUsed={() => setChatText('')}
        onProjectChange={(projectId) => select({ projectId })}
        onDraftProvider={setDraftProvider}
        onShowComment={showComment}
      />
    )
  }
  // A tab that can't show (its workspace is gone) falls back to the chat.
  const viewKey = tab !== 'chat' && view(tab) ? tab : chatKey(agent)
  // Not during the workspace switch above: it reset them.
  if (tabsWs === sel.workspaceId && !visited.includes(viewKey)) setVisited([...visited, viewKey])

  return (
    <HostContext value={hostId}>
    <OpenFileContext value={openFile}>
      <div
        ref={appRef}
        className={`app ${panel && cwd ? 'with-panel' : ''} ${sidebar ? '' : 'no-sidebar'} ${swipe ? `swipe-${swipe.side} swipe-${swipe.settle ?? 'drag'}` : ''}`}
        style={{ '--sidebar-w': `${sidebarW}px`, '--panel-w': `${panelW}px` } as CSSProperties}
      >
        <Sidebar
          selection={sel}
          onSelect={(s) => {
            select(s)
            dismiss()
          }}
          onArchive={archive}
          onCloseAgent={closeAgent}
          activeOnly={activeOnly}
          onToggleActiveOnly={() => setActiveOnly(!activeOnly)}
          onOpenSettings={() => setSettings({ hostId })}
          onOpenHost={(id) => setSettings({ hostId: id, section: 'Host' })}
          onImport={(projectId) => {
            const p = projects.find((x) => x.projectId === projectId)
            if (p) setImportTarget({ projectId, name: projectName(p), rootPath: p.projectRootPath })
          }}
        />
        {sidebar && <Resizer side="left" label="Resize Sidebar" width={sidebarW} onResize={setSidebarW} />}
        <button className={`icon-btn corner left ${sidebar ? 'on' : ''}`} title={`Toggle Sidebar (${formatCombo(sidebarKey)})`} onClick={() => setSidebar(!sidebar)}>
          <PanelLeft size={15} />
          <X size={15} />
        </button>
        {cwd && (
          <button className={`icon-btn corner right ${panel ? 'on' : ''}`} title={`Toggle File Panel (${formatCombo(panelKey)})`} onClick={() => setPanel(panel ? null : 'changes')}>
            <PanelRight size={15} />
            <X size={15} />
          </button>
        )}

        <main className="center">
          <div className="tabbar">
            {/* On phones, a popover listing every tab (the bar shows only the open one); picking one closes it. */}
            <div className="tabs" id="tab-list" popover="auto" onClick={(e) => e.currentTarget.hidePopover()}>
              {target &&
                chatTabs.map((a) => (
                  <div key={a?.id ?? 'new'} className={`tab agent-tab ${tab === 'chat' && a === agent ? 'on' : ''}`} {...clickable(() => openChat(a))}>
                    <ProviderIcon provider={a ? a.provider : draftProvider} size={13} />
                    <span className="truncate">{a ? a.title || 'Agent' : 'New agent'}</span>
                    {a && (
                      <button
                        className="tab-close hover-swap"
                        title={`Close (${formatCombo(closeAgentKey)})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void closeAgent(a)
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                    {a?.status === 'running' && <Loader2 size={13} className="spin muted status-mark" aria-label="Working" />}
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
                      closeTerminal(x.id)
                    }}
                  >
                    <X size={12} />
                  </button>
                  {x.activity?.state === 'working' && <Loader2 size={13} className="spin muted status-mark" aria-label="Working" />}
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
                <div key={path} className={`tab ${tab === `file:${path}` ? 'on' : ''}`} onClick={() => setTab(`file:${path}`)} title={path}>
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
            </div>
            <button className="icon-btn tab-list-btn" title="All Tabs" popoverTarget="tab-list">
              <ChevronDown size={15} />
            </button>
            {cwd && <OpenInEditor path={cwd} />}
          </div>

          {!target ? (
            <div className="empty-chat">
              <h2>mypaseo</h2>
              {hosts.some((h) => byHost[h.id]?.status === 'connected') || !hosts.some((h) => byHost[h.id]?.error) ? (
                <p className="muted">Pick a project or workspace on the left, or add a project.</p>
              ) : (
                <>
                  <p className="muted">Can't reach a Paseo daemon. Start one on this computer and let this page connect to it:</p>
                  <pre className="setup-cmd">
                    {`npx @getpaseo/cli daemon start\nnpx @getpaseo/cli daemon config set daemon.cors.allowedOrigins '["https://app.paseo.sh","${location.origin}"]'`}
                  </pre>
                  <p className="muted">Or add a remote daemon from the server button under the projects.</p>
                </>
              )}
            </div>
          ) : (
            // Every view shown since the workspace opened stays mounted, so each tab keeps its scroll and state.
            // In mount order, never reordered: moving a node would reset its scroll. Inert keeps hidden ones out of focus and clicks.
            <div className="views">
              {visited.map((k) => {
                const v = view(k)
                return (
                  v && (
                    <div key={k} className="view" inert={k !== viewKey}>
                      <ActiveViewContext value={k === viewKey}>{v}</ActiveViewContext>
                    </div>
                  )
                )
              })}
            </div>
          )}
        </main>
        {(sidebar || (panel && cwd)) && <div className="scrim" onClick={dismiss} />}

        {panel && cwd && <Resizer side="right" label="Resize File Panel" width={panelW} onResize={setPanelW} />}
        {(panel || swipe?.side === 'right') && cwd && workspace && (
          <aside className="panel">
            <div className="panel-tabs">
              {isGit && (
                <button className={`panel-tab ${panelView === 'changes' ? 'on' : ''}`} title="Changes" onClick={openChanges}>
                  <FileDiff size={14} /> <span className="truncate">Changes</span>
                </button>
              )}
              <button className={`panel-tab ${panelView === 'files' ? 'on' : ''}`} title="Files" onClick={() => setPanel('files')}>
                <Files size={14} /> <span className="truncate">Files</span>
              </button>
              {isGit && (
                <button className={`panel-tab ${panelView === 'graph' ? 'on' : ''}`} title="Git Graph" onClick={() => openGraph()}>
                  <GitGraphIcon size={14} /> <span className="truncate">Git Graph</span>
                </button>
              )}
              <button className={`panel-tab ${panelView === 'terminals' ? 'on' : ''}`} title="Terminals" onClick={openTerminals}>
                <SquareTerminal size={14} /> <span className="truncate">Terminals</span>
              </button>
            </div>
            {panelView === 'terminals' ? (
              <TerminalList
                terminals={terms.terminals}
                activeId={tab.startsWith('term:') ? tab.slice('term:'.length) : undefined}
                onOpen={(id) => {
                  setTab(`term:${id}`)
                  dismiss()
                }}
                onNew={() => {
                  void newTerminal()
                  dismiss()
                }}
              />
            ) : panelView === 'files' ? (
              <FileTree key={cwd} cwd={cwd} rootName={workspace.projectDisplayName} onOpen={openFile} activePath={tab.startsWith('file:') ? tab.slice(5) : undefined} />
            ) : panelView === 'graph' && !commit ? (
              <div className="empty">Pick a commit in the graph to see its changes.</div>
            ) : panelView === 'graph' && commit ? (
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
        )}

        {cwd && tab !== 'chat' && (
          <SelectionAction
            title="Add Comment"
            onAdd={(s) => {
              getSelection()?.removeAllRanges()
              startComment(reviewKey(hostId, cwd), s)
            }}
          />
        )}
        {/* A removed host's settings close themselves. */}
        {settings && hosts.some((h) => h.id === settings.hostId) && (
          <HostContext value={settings.hostId}>
            <Settings initialSection={settings.section} onClose={() => setSettings(null)} />
          </HostContext>
        )}
        {palette && <CommandPalette cwd={cwd} onClose={() => setPalette(false)} />}
        {importTarget && (
          <HostContext value={projects.find((p) => p.projectId === importTarget.projectId)?.hostId ?? hostId}>
            <ImportSession
              target={importTarget}
              onClose={() => setImportTarget(null)}
              onImported={(a) => {
                setImportTarget(null)
                select({ projectId: importTarget.projectId, workspaceId: a.workspaceId, agentId: a.id })
              }}
            />
          </HostContext>
        )}
      </div>
    </OpenFileContext>
    </HostContext>
  )
}
