import { FileCode, FileDiff, FolderTree, MessageSquare, PanelRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ChangesList, ChangesView } from './components/Changes'
import { Chat, type Target } from './components/Chat'
import { FileTree, FileView } from './components/Files'
import { ImportSession } from './components/ImportSession'
import { Settings } from './components/Settings'
import { Sidebar, type Selection } from './components/Sidebar'
import type { DiffMode } from './daemon'
import { OpenFileContext } from './openFile'
import { startSync, useStore } from './store'
import { totals, useCheckoutDiff } from './useCheckoutDiff'

type Tab = 'chat' | 'changes' | `file:${string}`

export default function App() {
  useEffect(() => startSync(), [])
  const { projects, workspaces, agents } = useStore()

  const [sel, setSel] = useState<Selection>(() => JSON.parse(localStorage.mypaseoSelection ?? '{}'))
  const select = (s: Selection) => {
    setSel(s)
    localStorage.mypaseoSelection = JSON.stringify(s)
  }
  const workspace = workspaces.find((w) => w.id === sel.workspaceId)
  const project = projects.find((p) => p.projectId === (workspace?.projectId ?? sel.projectId))
  const agent = agents.find((a) => a.id === sel.agentId)
  const target: Target | null = workspace
    ? { projectId: workspace.projectId, name: workspace.projectDisplayName, rootPath: workspace.projectRootPath, workspace }
    : project
      ? { projectId: project.projectId, name: project.projectCustomName || project.projectDisplayName, rootPath: project.projectRootPath }
      : null
  const cwd = workspace?.workspaceDirectory
  const isGit = workspace?.projectKind === 'git'

  const [tab, setTab] = useState<Tab>('chat')
  const [files, setFiles] = useState<string[]>([])
  const [panel, setPanel] = useState<'files' | 'changes' | null>('files')
  const [diffMode, setDiffMode] = useState<DiffMode>('uncommitted')
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importTarget, setImportTarget] = useState<Target | null>(null)
  const diff = useCheckoutDiff(isGit ? cwd : undefined, diffMode)
  const t = totals(diff.files)

  // Tabs belong to a workspace: reset them while rendering when the workspace changes.
  const [tabsCwd, setTabsCwd] = useState(cwd)
  if (tabsCwd !== cwd) {
    setTabsCwd(cwd)
    setFiles([])
    setTab('chat')
  }

  const openFile = (path: string) => {
    setFiles((f) => (f.includes(path) ? f : [...f, path]))
    setTab(`file:${path}`)
  }
  const closeFile = (path: string) => {
    setFiles((f) => f.filter((p) => p !== path))
    if (tab === `file:${path}`) setTab('chat')
  }
  const showChange = (path: string) => {
    setTab('changes')
    setFocus((f) => ({ path, n: (f?.n ?? 0) + 1 }))
  }

  return (
    <OpenFileContext value={openFile}>
      <div className={`app ${panel && cwd ? 'with-panel' : ''}`}>
        <Sidebar
          selection={sel}
          onSelect={select}
          onOpenSettings={() => setSettingsOpen(true)}
          onImport={(projectId) => {
            const p = projects.find((x) => x.projectId === projectId)
            if (p) setImportTarget({ projectId, name: p.projectCustomName || p.projectDisplayName, rootPath: p.projectRootPath })
          }}
        />

        <main className="center">
          <div className="tabbar">
            {target && (
              <button className={`tab ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>
                <MessageSquare size={13} />
                <span className="truncate">{agent ? agent.title || 'Agent' : 'New agent'}</span>
              </button>
            )}
            {isGit && (
              <button className={`tab ${tab === 'changes' ? 'on' : ''}`} onClick={() => setTab('changes')}>
                <FileDiff size={13} />
                Changes
                {diff.files.length > 0 && <span className="badge">{diff.files.length}</span>}
              </button>
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
            <span className="grow" />
            {cwd && (
              <button className={`icon-btn ${panel ? 'on' : ''}`} title="Toggle file panel" onClick={() => setPanel(panel ? null : 'files')}>
                <PanelRight size={15} />
              </button>
            )}
          </div>

          {!target ? (
            <div className="empty-chat">
              <h2>mypaseo</h2>
              <p className="muted">Pick a project or workspace on the left, or add a project.</p>
            </div>
          ) : tab === 'changes' && cwd ? (
            <ChangesView cwd={cwd} diff={diff} mode={diffMode} onModeChange={setDiffMode} focus={focus} onOpenFile={openFile} />
          ) : tab.startsWith('file:') && cwd ? (
            <FileView key={tab} cwd={cwd} path={tab.slice(5)} />
          ) : (
            <Chat
              key={agent?.id ?? `${target.projectId}/${workspace?.id}`}
              agent={agent}
              target={target}
              onCreated={(a) => select({ projectId: target.projectId, workspaceId: a.workspaceId, agentId: a.id })}
              onImport={() => setImportTarget(target)}
            />
          )}
        </main>

        {panel && cwd && workspace && (
          <aside className="panel">
            <div className="panel-tabs">
              <button className={`icon-btn ${panel === 'files' ? 'on' : ''}`} title="Files" onClick={() => setPanel('files')}>
                <FolderTree size={15} />
              </button>
              {isGit && (
                <button className={`icon-btn ${panel === 'changes' ? 'on' : ''}`} title="Changes" onClick={() => setPanel('changes')}>
                  <FileDiff size={15} />
                </button>
              )}
              <span className="grow" />
              {panel === 'changes' && (
                <span className="stat">
                  <span className="add">+{t.add}</span> <span className="del">−{t.del}</span>
                </span>
              )}
            </div>
            {panel === 'files' || !isGit ? (
              <FileTree key={cwd} cwd={cwd} rootName={workspace.projectDisplayName} onOpen={openFile} activePath={tab.startsWith('file:') ? tab.slice(5) : undefined} />
            ) : (
              <ChangesList diff={diff} onPick={showChange} />
            )}
          </aside>
        )}

        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
        {importTarget && (
          <ImportSession
            target={importTarget}
            onClose={() => setImportTarget(null)}
            onImported={(a) => {
              setImportTarget(null)
              select({ projectId: importTarget.projectId, workspaceId: a.workspaceId, agentId: a.id })
            }}
          />
        )}
      </div>
    </OpenFileContext>
  )
}
