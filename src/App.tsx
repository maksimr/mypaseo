import { PanelLeft, PanelRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { focusRow, navigateBars } from './a11y'
import { focusView, isTouch, moveFocus } from './focus'
import { ActiveViewContext } from './activeView'
import { ArtifactView } from './features/artifacts/Artifacts'
import { ChangesView } from './features/changes/Changes'
import { Chat } from './features/chat/Chat'
import type { Target } from './features/chat/target'
import { CommandPalette } from './features/palette/CommandPalette'
import { CommitGraph } from './features/git-graph/CommitGraph'
import { FileView } from './features/files/Files'
import { ImportSession } from './features/chat/ImportSession'
import { ListSearch } from './features/list-search/ListSearch'
import { Settings, type Section } from './features/settings/Settings'
import { isLead, roomMembers } from './features/rooms/members'
import { Sidebar, type Selection } from './features/sidebar/Sidebar'
import { roomTree } from './features/sidebar/roomTree'
import { parentIn, topLevel } from './features/subagents/parent'
import { Subagents } from './features/subagents/Subagents'
import { SubagentView } from './features/subagents/SubagentView'
import { TerminalView } from './features/terminal/Terminal'
import { UpdateBanner } from './features/update/UpdateBanner'
import { errorText, type Agent, type Workspace } from './daemon'
import { formatCombo, isShortcut, useShortcut } from './keymap'
import { useAttentionNotifications } from './notifications'
import { OpenArtifactContext } from './openArtifact'
import { OpenFileContext } from './openFile'
import { selectionRef } from './features/review/selection'
import { SelectionAction } from './features/review/SelectionAction'
import { reviewKey, startComment } from './features/review/review'
import { archiveAgent, archiveWorkspace, byRecent, HostContext, projectName, projectWorkspaces, sidebarWorkspaces, startSync, useStore } from './store'
import { useEdgeSwipe } from './swipe'
import { useMenuFocusTrap, useMenuScrim } from './components/menu'
import { useTabStatus } from './tabStatus'
import { useCheckoutDiff, useCommitDiff } from './features/changes/useCheckoutDiff'
import { useTerminals } from './features/terminal/useTerminals'
import { Panel, type PanelView } from './features/tabs/Panel'
import { TabBar } from './features/tabs/TabBar'
import { useTabs, type Tab } from './features/tabs/useTabs'

const MIN_W = 180
const MAX_W = 600
/** Below this (tablet portrait) the side panes overlay the center; wider keeps three columns. Same query as styles/tablet.css. */
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
  // Agents whose chat tab was closed: they stay in the sidebar, and selecting one reopens its tab. Memory only.
  const [closedTabs, setClosedTabs] = useState<ReadonlySet<string>>(new Set())
  const select = (s: Selection) => {
    setSel(s)
    setBack(s.agentId ? undefined : sel.agentId ? sel : back)
    localStorage.mypaseoSelection = JSON.stringify(s)
    const id = s.agentId
    if (id) setClosedTabs((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : c))
  }
  // The newest top-level agent, as the sidebar's workspace row: a room opens at its lead, not a member, nor a subagent.
  const openWorkspace = (w: Workspace) =>
    select({ projectId: w.projectId, workspaceId: w.id, agentId: roomTree(topLevel(agents.filter((a) => a.workspaceId === w.id && !closedTabs.has(a.id))).sort(byRecent))[0]?.agent.id })
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
  /**
   * Archives an agent, or, once confirmed, a room's lead and every member: closing the lead closes the room. If the
   * selected agent goes, selects the next one left in its workspace (or the composer).
   */
  const closeAgent = async (a: Agent) => {
    // A subagent's tab closes to its parent, as in Paseo desktop: it goes on, on the parent's track, whose Archive closes it.
    const parent = parentIn(a, agents)
    if (parent) {
      if (a.id === sel.agentId) select({ ...sel, agentId: parent.id })
      return
    }
    const closing = isLead(a) ? roomMembers(agents, a.id) : [a]
    if (closing.length > 1 && !confirm(`Close the room? Its ${closing.length} agents are archived.`)) return
    const list = agents.filter((x) => x.workspaceId === a.workspaceId).sort(byRecent)
    const i = list.findIndex((x) => x.id === a.id)
    const near = [...list.slice(i + 1), ...list.slice(0, i).reverse()].find((x) => !closing.includes(x))
    const closed = await Promise.all(closing.map(archiveAgent))
    if (closing.some((x, k) => closed[k] && x.id === sel.agentId)) select({ ...sel, agentId: near?.id })
  }
  const workspace = workspaces.find((w) => w.id === sel.workspaceId)
  const project = projects.find((p) => p.projectId === (workspace?.projectId ?? sel.projectId))
  // The selection's host; with nothing selected (or still loading), the first one.
  const hostId = (workspace ?? project)?.hostId ?? hosts[0].id
  const agent = agents.find((a) => a.id === sel.agentId)
  // One chat tab per workspace agent, oldest first so a new one opens after the others; undefined is the "New agent" composer, last.
  // A subagent's tab only while it's open: its parent's track lists them.
  const inWorkspace = workspace ? agents.filter((a) => a.workspaceId === workspace.id) : []
  const wsAgents = inWorkspace
    .filter((a) => a.id === sel.agentId || (!parentIn(a, inWorkspace) && !closedTabs.has(a.id)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const chatTabs = wsAgents.some((a) => a.id === agent?.id) ? wsAgents : [...wsAgents, agent]
  /** Closes an agent's tab, not the agent; a lead's takes its room's members' along. The open one hands over to its neighbor tab. */
  const closeTab = (a: Agent) => {
    if (parentIn(a, agents)) return void closeAgent(a) // a subagent's tab goes back to its parent
    const closing = (isLead(a) ? roomMembers(agents, a.id) : [a]).map((x) => x.id)
    setClosedTabs((c) => new Set([...c, ...closing]))
    if (!sel.agentId || !closing.includes(sel.agentId)) return
    const open = wsAgents.filter((x) => x === a || !closing.includes(x.id))
    const i = open.indexOf(a)
    select({ ...sel, agentId: (open[i + 1] ?? open[i - 1])?.id })
  }
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
  useMenuScrim()
  useMenuFocusTrap()
  const projectId = project?.projectId
  const cwd = workspace?.workspaceDirectory
  const isGit = workspace?.projectKind === 'git'

  const [panel, showPanel] = useState<PanelView | null>(() => JSON.parse(localStorage.mypaseoPanel ?? 'null'))
  const [panelTab, setPanelTab] = useState<PanelView>(() => panel ?? localStorage.mypaseoPanelTab ?? 'changes') // kept while closed: the toggle reopens it
  const setPanel = (p: PanelView | null) => {
    showPanel(p)
    if (p) setPanelTab(p)
  }
  const panelView = isGit || panelTab === 'terminals' || panelTab === 'artifacts' ? panelTab : 'files'
  const [settings, setSettings] = useState<{ hostId: string; section?: Section } | null>(null)
  const [palette, setPalette] = useState(false)
  const [chatText, setChatText] = useState('') // handed to the composer when the chat tab mounts
  const [artifact, setArtifact] = useState<{ agentId: string; doc: string }>() // picked in the Artifacts panel
  const [sidebar, setSidebar] = useState(() => localStorage.mypaseoSidebar !== 'false')
  useEffect(() => {
    localStorage.mypaseoSidebar = sidebar
    localStorage.mypaseoPanel = JSON.stringify(panel)
    localStorage.mypaseoPanelTab = panelTab
    localStorage.mypaseoActiveOnly = activeOnly
  }, [sidebar, panel, panelTab, activeOnly])
  /** On narrow windows, picking something in an overlaid pane closes the panes, like a drawer: a lone one slides away. */
  const dismiss = () => {
    if (!matchMedia(NARROW).matches) return
    const open = (['left', 'right'] as const).filter((s) => (s === 'left' ? sidebar : panel && cwd))
    if (open.length === 1) return slideClosed(open[0])
    setSidebar(false)
    setPanel(null)
  }
  const diff = useCheckoutDiff(hostId, isGit ? cwd : undefined)
  const terms = useTerminals(hostId, workspace)
  const tabs = useTabs({ workspaceId: sel.workspaceId, isGit, diff, terms, setPanel, dismiss })
  const { tab, setTab, beside, files, artifacts, changesTab, graphTab, graphPath, commit, setCommit, commitTab, commitFocus, focus, fileLine } = tabs
  const { openFile, openChanges, openGraph, closeChanges, closeGraph, closeCommit, closeFile, openArtifact, closeArtifact, showComment } = tabs
  const commitDiff = useCommitDiff(hostId, isGit ? cwd : undefined, commitTab)
  // Touch, on narrow windows: dragging an open sidebar or file panel toward its edge slides it closed.
  const appRef = useRef<HTMLDivElement>(null)
  const [swipe, slideClosed] = useEdgeSwipe(
    appRef,
    () => matchMedia(NARROW).matches,
    (side, open) => (side === 'left' ? setSidebar(open) : setPanel(open ? panelTab : null)),
  )
  const [sidebarW, setSidebarW] = useWidth('mypaseoSidebarWidth', 270)
  const [panelW, setPanelW] = useWidth('mypaseoPanelWidth', 320) // room for the Changes, Files and Git Graph tabs
  const sidebarKey = useShortcut('toggleSidebar')
  const panelKey = useShortcut('togglePanel')
  // Like Zed's docks: a pane the toggle opens takes the focus on its current row, so arrow keys and Enter work there;
  // one it closes hands the focus to the open tab, unless the focus is already there or in the other pane. Not on a tap
  // (focus = false): the composer taking it would open the on-screen keyboard. On narrow windows a closing pane slides away.
  const toggleSidebar = (focus = true) => {
    if (sidebar && matchMedia(NARROW).matches) slideClosed('left')
    else flushSync(() => setSidebar(!sidebar))
    if (!focus) return
    if (!sidebar) focusRow(appRef.current?.querySelector<HTMLElement>('.sidebar'))
    else if (!document.activeElement?.closest('.center, .panel')) focusView(appRef.current)
  }
  const togglePanel = (focus = true) => {
    if (panel && matchMedia(NARROW).matches) slideClosed('right')
    else flushSync(() => setPanel(panel ? null : panelTab))
    if (!focus) return
    if (!panel) focusRow(appRef.current?.querySelector<HTMLElement>('.panel'))
    else if (!document.activeElement?.closest('.center, .sidebar')) focusView(appRef.current)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isShortcut(e, 'commandPalette')) {
        e.preventDefault()
        setPalette((p) => !p)
      }
      if (isShortcut(e, 'toggleSidebar')) {
        e.preventDefault()
        toggleSidebar()
      }
      const dir = isShortcut(e, 'focusLeft') ? 'left' : isShortcut(e, 'focusRight') ? 'right' : isShortcut(e, 'focusUp') ? 'up' : isShortcut(e, 'focusDown') ? 'down' : undefined
      if (dir && appRef.current) {
        e.preventDefault()
        flushSync(() => {}) // run from the command palette: it closes first, handing the focus back to where it was
        moveFocus(appRef.current, dir)
      }
      if (isShortcut(e, 'toggleActiveOnly')) {
        e.preventDefault()
        setActiveOnly((a) => !a)
      }
      if (cwd && isShortcut(e, 'togglePanel')) {
        e.preventDefault()
        togglePanel()
      }
      const pane = isShortcut(e, 'openFiles') ? 'files' : isShortcut(e, 'openArtifacts') ? 'artifacts' : undefined
      if (cwd && pane) {
        e.preventDefault()
        flushSync(() => setPanel(pane)) // also closes the command palette, which hands the focus back first
        focusRow(appRef.current?.querySelector<HTMLElement>('.panel'))
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
        const order: (Tab | Agent | undefined)[] = [...chatTabs, ...tabs.order]
        const next = order[(order.indexOf(tab === 'chat' ? agent : tab) + tabStep + order.length) % order.length]
        if (typeof next === 'string') setTab(next)
        else openChat(next)
      }
      const composer = tab === 'chat' && !agent
      if (target && isShortcut(e, 'closeAgent') && (!composer || agents.some((a) => a.id === back?.agentId && !closedTabs.has(a.id)))) {
        e.preventDefault()
        if (composer) select(back!)
        else if (tab === 'chat') closeTab(agent!)
        else if (tab === 'changes') closeChanges()
        else if (tab === 'graph') closeGraph()
        else if (tab === 'commit') closeCommit()
        else if (tab.startsWith('term:')) closeTerminal(tab.slice('term:'.length))
        else if (tab.startsWith('art:')) closeArtifact(tab.slice('art:'.length))
        else if (tab.startsWith('sub:')) tabs.closeSubagent(tab)
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
    if (tab === `term:${id}`) setTab(beside(tab))
  }
  const addToChat = (ref: string) => {
    setChatText((t) => `${t}${t ? ' ' : ''}${ref} `)
    setTab('chat')
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
      return files.includes(path) && cwd ? <FileView cwd={cwd} path={path} reveal={fileLine?.path === path ? fileLine : undefined} onHistory={isGit ? () => openGraph(path) : undefined} /> : null
    }
    if (k.startsWith('art:')) {
      const a = artifacts.find((x) => `art:${x.id}` === k)
      return a ? <ArtifactView doc={a.doc} /> : null
    }
    if (k.startsWith('sub:')) {
      const s = tabs.subagents.find((x) => x.key === k)
      return s ? <SubagentView parentAgentId={s.parentAgentId} subagentId={s.subagentId} cwd={cwd} onOpenProvider={tabs.openSubagent} /> : null
    }
    const i = chatTabs.findIndex((a) => chatKey(a) === k)
    if (i < 0) return null
    const a = chatTabs[i]
    const openAgent = (a: Agent) => select({ projectId: target.projectId, workspaceId: a.workspaceId, agentId: a.id })
    return (
      <Chat
        agent={a}
        target={target}
        onCreated={openAgent}
        onImport={() => setImportTarget(target)}
        initialText={a === agent ? chatText : ''}
        onInitialTextUsed={() => setChatText('')}
        onProjectChange={(projectId) => select({ projectId })}
        onDraftProvider={setDraftProvider}
        onShowComment={showComment}
        reveal={a && artifact?.agentId === a.id ? artifact : undefined}
        track={a && <Subagents agent={a} onOpenAgent={openAgent} onOpenProvider={tabs.openSubagent} />}
      />
    )
  }
  // A tab that can't show (its workspace is gone) falls back to the chat.
  const viewKey = tab !== 'chat' && view(tab) ? tab : chatKey(agent)
  tabs.visit(viewKey)

  return (
    <HostContext value={hostId}>
    <OpenFileContext value={openFile}>
    <OpenArtifactContext value={openArtifact}>
      <div
        ref={appRef}
        onKeyDown={navigateBars}
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
        <button className={`icon-btn corner left ${sidebar ? 'on' : ''}`} title={`Toggle Sidebar (${formatCombo(sidebarKey)})`} onClick={() => toggleSidebar(!isTouch())}>
          <PanelLeft size={15} />
          <X size={15} />
        </button>
        {cwd && (
          <button className={`icon-btn corner right ${panel ? 'on' : ''}`} title={`Toggle Secondary Sidebar (${formatCombo(panelKey)})`} onClick={() => togglePanel(!isTouch())}>
            <PanelRight size={15} />
            <X size={15} />
          </button>
        )}

        <main className="center">
          <TabBar
            tabs={tabs}
            chatTabs={target ? chatTabs : []}
            agent={agent}
            draftProvider={draftProvider}
            terms={terms}
            diff={diff}
            cwd={cwd}
            onOpenChat={openChat}
            onCloseAgent={closeTab}
            onCloseTerminal={closeTerminal}
          />

          {!target ? (
            <div className="empty-chat">
              <div className="landing-logo" />
              <div className="landing-text">
                {hosts.some((h) => byHost[h.id]?.status === 'connected') || !hosts.some((h) => byHost[h.id]?.error) ? (
                  <p>Pick a project or workspace on the left, or add a project.</p>
                ) : (
                  <>
                    <p>Can't reach a Paseo daemon. Start one on this computer:</p>
                    <div className="setup-cmd">
                      <b>npx</b> <span>@getpaseo/cli daemon start</span>
                    </div>
                    <p>Then let this page connect to it:</p>
                    <div className="setup-cmd">
                      <b>npx</b>{' '}
                      <span>{`@getpaseo/cli daemon config set daemon.cors.allowedOrigins '["https://app.paseo.sh","${location.origin}"]'`}</span>
                    </div>
                    <p>Daemon on another machine? Add it with the server button under the projects.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            // Every view shown since the workspace opened stays mounted, so each tab keeps its scroll and state.
            // In mount order, never reordered: moving a node would reset its scroll. Inert keeps hidden ones out of focus and clicks.
            <div className="views">
              {tabs.visited.map((k) => {
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
        {panel && cwd && workspace && (
          <Panel
            tabs={tabs}
            workspace={workspace}
            isGit={isGit}
            view={panelView}
            onView={setPanel}
            terms={terms}
            diff={diff}
            onOpenTerminals={openTerminals}
            onNewTerminal={() => void newTerminal()}
            onOpenArtifact={(a, doc) => {
              openChat(a)
              setArtifact({ agentId: a.id, doc })
            }}
            dismiss={dismiss}
          />
        )}

        {cwd && tab !== 'chat' && (
          <SelectionAction
            title="Add Comment"
            cwd={cwd}
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
        {palette && (
          <CommandPalette
            cwd={cwd}
            projectId={workspace?.projectId}
            // The project's own folder, else its first workspace; with none, its New Agent composer.
            onProject={(id) => {
              const ws = projectWorkspaces(id, workspaces, agents)
              const w = ws.find((x) => x.workspaceDirectory === x.projectRootPath) ?? ws[0]
              if (w) openWorkspace(w)
              else select({ projectId: id })
            }}
            onClose={() => setPalette(false)}
          />
        )}
        <UpdateBanner />
        <ListSearch />
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
    </OpenArtifactContext>
    </OpenFileContext>
    </HostContext>
  )
}
