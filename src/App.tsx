import { FileCode, FileDiff, Files, GitCommitHorizontal, Loader2, PanelLeft, PanelRight, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { ChangesList, ChangesView } from './components/Changes'
import { Chat, type Target } from './components/Chat'
import { CommitDetails, CommitGraph } from './components/CommitGraph'
import { FileTree, FileView } from './components/Files'
import { ImportSession } from './components/ImportSession'
import { ProviderIcon } from './components/ProviderIcon'
import { Settings, type Section } from './components/Settings'
import { Sidebar, type Selection } from './components/Sidebar'
import type { Agent, Workspace } from './daemon'
import { formatCombo, isShortcut, useShortcut } from './keymap'
import { useAttentionNotifications } from './notifications'
import { OpenFileContext } from './openFile'
import { selectionRef } from './selection'
import { SelectionAction } from './components/SelectionAction'
import { clickable } from './a11y'
import { archiveAgent, archiveWorkspace, byRecent, HostContext, sidebarWorkspaces, startSync, useStore } from './store'
import { useTabStatus } from './tabStatus'
import { totals, useCheckoutDiff, useCommitDiff } from './useCheckoutDiff'

type Tab = 'chat' | 'changes' | 'graph' | 'commit' | `file:${string}`

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
  const { hosts, byHost, projects, workspaces, agents } = useStore()

  const [sel, setSel] = useState<Selection>(() => JSON.parse(localStorage.mypaseoSelection ?? '{}'))
  const select = (s: Selection) => {
    setSel(s)
    localStorage.mypaseoSelection = JSON.stringify(s)
  }
  const openWorkspace = (w: Workspace) =>
    select({ projectId: w.projectId, workspaceId: w.id, agentId: agents.filter((a) => a.workspaceId === w.id).sort(byRecent)[0]?.id })
  const [activeOnly, setActiveOnly] = useState(() => localStorage.mypaseoActiveOnly === 'true')
  const listed = () => sidebarWorkspaces(projects, workspaces, agents, activeOnly, sel.workspaceId)
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
      ? { projectId: project.projectId, name: project.projectCustomName || project.projectDisplayName, rootPath: project.projectRootPath }
      : null
  useTabStatus(agent?.title || workspace?.title || workspace?.name || target?.name, agents)
  const projectId = project?.projectId
  const cwd = workspace?.workspaceDirectory
  const isGit = workspace?.projectKind === 'git'

  const [tab, setTab] = useState<Tab>('chat')
  const [files, setFiles] = useState<string[]>([])
  // undefined: shown while the workspace has changes; true/false: the user opened or closed it.
  const [changesPick, setChangesPick] = useState<boolean>()
  const [graphTab, setGraphTab] = useState(false)
  const [commit, setCommit] = useState<string>() // picked in the git graph, shown in the panel
  const [commitTab, setCommitTab] = useState<string>() // the commit whose diff the 'commit' tab shows
  const [commitFocus, setCommitFocus] = useState<{ path: string; n: number } | null>(null)
  const [panel, setPanel] = useState<'files' | 'changes' | 'graph' | null>(() => JSON.parse(localStorage.mypaseoPanel ?? 'null'))
  const panelView = !isGit ? 'files' : panel
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null)
  const [settings, setSettings] = useState<{ hostId: string; section?: Section } | null>(null)
  const [chatText, setChatText] = useState('') // handed to the composer when the chat tab mounts
  const [sidebar, setSidebar] = useState(() => localStorage.mypaseoSidebar !== 'false')
  useEffect(() => {
    localStorage.mypaseoSidebar = sidebar
    localStorage.mypaseoPanel = JSON.stringify(panel)
    localStorage.mypaseoActiveOnly = activeOnly
  }, [sidebar, panel, activeOnly])
  const [sidebarW, setSidebarW] = useWidth('mypaseoSidebarWidth', 270)
  const [panelW, setPanelW] = useWidth('mypaseoPanelWidth', 320) // room for the Changes, Files and Git Graph tabs
  const sidebarKey = useShortcut('toggleSidebar')
  const panelKey = useShortcut('togglePanel')
  const addKey = useShortcut('addToChat')
  const closeAgentKey = useShortcut('closeAgent')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      const tabStep = isShortcut(e, 'nextTab') ? 1 : isShortcut(e, 'prevTab') ? -1 : 0
      if (target && tabStep) {
        e.preventDefault()
        const tabs: (Tab | Agent | undefined)[] = [
          ...chatTabs,
          ...(changesTab ? ['changes' as const] : []),
          ...(graphTab ? ['graph' as const] : []),
          ...(commitTab ? ['commit' as const] : []),
          ...files.map((p) => `file:${p}` as const),
        ]
        const next = tabs[(tabs.indexOf(tab === 'chat' ? agent : tab) + tabStep + tabs.length) % tabs.length]
        if (typeof next === 'string') setTab(next)
        else openChat(next)
      }
      if (agent && tab === 'chat' && isShortcut(e, 'closeAgent')) {
        e.preventDefault()
        void closeAgent(agent)
      }
      if (projectId && isShortcut(e, 'newWorkspace')) {
        e.preventDefault()
        select({ projectId })
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

  // Tabs belong to a workspace: reset them while rendering when the workspace changes.
  const [tabsCwd, setTabsCwd] = useState(cwd)
  if (tabsCwd !== cwd) {
    setTabsCwd(cwd)
    setFiles([])
    setChangesPick(undefined)
    setGraphTab(false)
    setCommit(undefined)
    setCommitTab(undefined)
    setTab('chat')
  }

  const openFile = (path: string) => {
    setFiles((f) => (f.includes(path) ? f : [...f, path]))
    setTab(`file:${path}`)
  }
  // A panel section also opens its center tab: the diff for Changes, the graph for Git Graph (whose section shows the picked commit).
  const openChanges = () => {
    setPanel('changes')
    setChangesPick(true)
    setTab('changes')
  }
  const openGraph = () => {
    setPanel('graph')
    setGraphTab(true)
    setTab('graph')
  }
  const closeFile = (path: string) => {
    setFiles((f) => f.filter((p) => p !== path))
    if (tab === `file:${path}`) setTab('chat')
  }
  const addToChat = (ref: string) => {
    setChatText((t) => `${t}${t ? ' ' : ''}${ref} `)
    setTab('chat')
  }
  const showChange = (path: string) => {
    setChangesPick(true)
    setTab('changes')
    setFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }))
  }

  return (
    <HostContext value={hostId}>
    <OpenFileContext value={openFile}>
      <div
        className={`app ${panel && cwd ? 'with-panel' : ''} ${sidebar ? '' : 'no-sidebar'}`}
        style={{ '--sidebar-w': `${sidebarW}px`, '--panel-w': `${panelW}px` } as CSSProperties}
      >
        <Sidebar
          selection={sel}
          onSelect={select}
          onArchive={archive}
          onCloseAgent={closeAgent}
          activeOnly={activeOnly}
          onToggleActiveOnly={() => setActiveOnly(!activeOnly)}
          onOpenSettings={() => setSettings({ hostId })}
          onOpenHost={(id) => setSettings({ hostId: id, section: 'Host' })}
          onImport={(projectId) => {
            const p = projects.find((x) => x.projectId === projectId)
            if (p) setImportTarget({ projectId, name: p.projectCustomName || p.projectDisplayName, rootPath: p.projectRootPath })
          }}
        />
        {sidebar && <Resizer side="left" label="Resize Sidebar" width={sidebarW} onResize={setSidebarW} />}
        <button className={`icon-btn corner left ${sidebar ? 'on' : ''}`} title={`Toggle Sidebar (${formatCombo(sidebarKey)})`} onClick={() => setSidebar(!sidebar)}>
          <PanelLeft size={15} />
        </button>
        {cwd && (
          <button className={`icon-btn corner right ${panel ? 'on' : ''}`} title={`Toggle File Panel (${formatCombo(panelKey)})`} onClick={() => setPanel(panel ? null : 'changes')}>
            <PanelRight size={15} />
          </button>
        )}

        <main className="center">
          <div className="tabbar">
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
                    setChangesPick(false)
                    if (tab === 'changes') setTab('chat')
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {graphTab && (
              <div className={`tab ${tab === 'graph' ? 'on' : ''}`} {...clickable(() => setTab('graph'))}>
                <GitGraphIcon size={13} />
                <span>Git Graph</span>
                <button
                  className="tab-close"
                  title="Close"
                  onClick={(e) => {
                    e.stopPropagation()
                    setGraphTab(false)
                    if (tab === 'graph') setTab('chat')
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
                    setCommitTab(undefined)
                    if (tab === 'commit') setTab(graphTab ? 'graph' : 'chat')
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
          ) : tab === 'changes' && cwd ? (
            <ChangesView cwd={cwd} diff={diff} focus={focus} onOpenFile={openFile} />
          ) : tab === 'graph' && workspace ? (
            <CommitGraph
              workspace={workspace}
              files={diff.files}
              selected={commit}
              onSelect={(sha) => {
                setCommit(sha)
                setPanel('graph')
              }}
            />
          ) : tab === 'commit' && commitTab && cwd ? (
            <ChangesView key={commitTab} cwd={cwd} diff={commitDiff} focus={commitFocus} onOpenFile={openFile} readOnly />
          ) : tab.startsWith('file:') && cwd ? (
            <FileView key={tab} cwd={cwd} path={tab.slice(5)} />
          ) : (
            <Chat
              key={agent?.id ?? `${target.projectId}/${workspace?.id}`}
              agent={agent}
              target={target}
              onCreated={(a) => select({ projectId: target.projectId, workspaceId: a.workspaceId, agentId: a.id })}
              onImport={() => setImportTarget(target)}
              initialText={chatText}
              onInitialTextUsed={() => setChatText('')}
              onProjectChange={(projectId) => select({ projectId })}
              onDraftProvider={setDraftProvider}
            />
          )}
        </main>

        {panel && cwd && <Resizer side="right" label="Resize File Panel" width={panelW} onResize={setPanelW} />}
        {panel && cwd && workspace && (
          <aside className="panel">
            <div className="panel-tabs">
              {isGit && (
                <button className={`panel-tab ${panelView === 'changes' ? 'on' : ''}`} onClick={openChanges}>
                  <FileDiff size={14} /> Changes
                </button>
              )}
              <button className={`panel-tab ${panelView === 'files' ? 'on' : ''}`} onClick={() => setPanel('files')}>
                <Files size={14} /> Files
              </button>
              {isGit && (
                <button className={`panel-tab ${panelView === 'graph' ? 'on' : ''}`} onClick={openGraph}>
                  <GitGraphIcon size={14} /> Git Graph
                </button>
              )}
              <span className="grow" />
              {panelView === 'changes' && (
                <span className="stat">
                  <span className="add">+{t.add}</span> <span className="del">−{t.del}</span>
                </span>
              )}
            </div>
            {panelView === 'files' ? (
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
                }}
              />
            ) : (
              <ChangesList diff={diff} onPick={showChange} />
            )}
          </aside>
        )}

        {target && tab !== 'chat' && <SelectionAction title={`Add to Chat (${formatCombo(addKey)})`} onAdd={addToChat} />}
        {/* A removed host's settings close themselves. */}
        {settings && hosts.some((h) => h.id === settings.hostId) && (
          <HostContext value={settings.hostId}>
            <Settings initialSection={settings.section} onClose={() => setSettings(null)} />
          </HostContext>
        )}
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
