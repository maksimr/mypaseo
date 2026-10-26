import { useState } from 'react'
import { artifactTitle } from '../../artifact'
import { revealComment, type ReviewComment } from '../review/review'
import type { DiffState } from '../changes/useCheckoutDiff'
import type { useTerminals } from '../terminal/useTerminals'
import type { PanelView } from './Panel'

export type Tab = 'chat' | 'changes' | 'graph' | 'commit' | `file:${string}` | `term:${string}` | `art:${string}`
export type Tabs = ReturnType<typeof useTabs>
type ArtifactTab = { id: string; doc: string; title: string }

let nextArtifact = 0 // artifact tab ids, unique across workspaces

/** The center tabs of the selected workspace, kept per workspace while switching between them. */
export function useTabs({
  workspaceId,
  isGit,
  diff,
  terms,
  setPanel,
  dismiss,
}: {
  workspaceId: string | undefined
  isGit: boolean
  diff: DiffState
  terms: ReturnType<typeof useTerminals>
  setPanel: (p: PanelView) => void
  dismiss: () => void
}) {
  const [tab, setTab] = useState<Tab>('chat')
  const [visited, setVisited] = useState<string[]>([]) // views shown since the workspace opened, in that order
  const [files, setFiles] = useState<string[]>([])
  const [artifacts, setArtifacts] = useState<ArtifactTab[]>([])
  // undefined: shown while the workspace has changes; true/false: the user opened or closed it.
  const [changesPick, setChangesPick] = useState<boolean>()
  const [graphTab, setGraphTab] = useState(false)
  const [graphPath, setGraphPath] = useState<string>() // set: the graph tab shows this file's history
  const [commit, setCommit] = useState<string>() // picked in the git graph, shown in the panel
  const [commitTab, setCommitTab] = useState<string>() // the commit whose diff the 'commit' tab shows
  const [commitFocus, setCommitFocus] = useState<{ path: string; n: number } | null>(null)
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null)
  const [fileLine, setFileLine] = useState<{ path: string; line: number } | null>(null) // a new object per open, so the same line scrolls again

  // Loading keeps it open while the diff arrives; an empty diff (all committed) closes it.
  const changesTab = changesPick ?? (isGit && (diff.files.length > 0 || (diff.loading && tab === 'changes')))
  if (tab === 'changes' && !changesTab) setTab('chat')
  // A terminal whose shell exited leaves the list.
  if (tab.startsWith('term:') && terms.loaded && !terms.terminals.some((x) => `term:${x.id}` === tab)) setTab('chat')

  // Tabs belong to a workspace: while rendering, stash the old one's and restore the new one's when the workspace changes.
  // Keyed by id, not directory: workspaces can share a checkout.
  const [tabsWs, setTabsWs] = useState(workspaceId)
  const [savedTabs, setSavedTabs] = useState(
    new Map<
      string | undefined,
      { tab: Tab; files: string[]; artifacts: ArtifactTab[]; changesPick?: boolean; graphTab: boolean; graphPath?: string; commit?: string; commitTab?: string }
    >(),
  )
  if (tabsWs !== workspaceId) {
    setSavedTabs(new Map(savedTabs).set(tabsWs, { tab, files, artifacts, changesPick, graphTab, graphPath, commit, commitTab }))
    const s = savedTabs.get(workspaceId)
    setTabsWs(workspaceId)
    setFiles(s?.files ?? [])
    setArtifacts(s?.artifacts ?? [])
    setChangesPick(s?.changesPick)
    setGraphTab(s?.graphTab ?? false)
    setGraphPath(s?.graphPath)
    setCommit(s?.commit)
    setCommitTab(s?.commitTab)
    setTab(s?.tab ?? 'chat')
    setFileLine(null)
    setVisited([])
  }
  /** Keeps a shown view mounted. Not during the workspace switch above: it reset them. */
  const visit = (k: string) => {
    if (tabsWs === workspaceId && !visited.includes(k)) setVisited([...visited, k])
  }

  /** The tabs after the chats, in the tab bar's order. */
  const order: Tab[] = [
    ...terms.terminals.map((t) => `term:${t.id}` as const),
    ...(changesTab ? ['changes' as const] : []),
    ...(graphTab ? ['graph' as const] : []),
    ...(commitTab ? ['commit' as const] : []),
    ...files.map((p) => `file:${p}` as const),
    ...artifacts.map((a) => `art:${a.id}` as const),
  ]
  /** The tab to show on closing tab k, as in a browser: the one to its right, else to its left (the chat, past the first). */
  const beside = (k: Tab): Tab => {
    const i = order.indexOf(k)
    return order[i + 1] ?? order[i - 1] ?? 'chat'
  }

  const openFile = (path: string, line?: number) => {
    setFiles((f) => (f.includes(path) ? f : [...f, path]))
    setFileLine(line ? { path, line } : null)
    setTab(`file:${path}`)
    dismiss()
  }
  /** Opening the same page again shows its tab. */
  const openArtifact = (doc: string, title = artifactTitle(doc)) => {
    let a = artifacts.find((x) => x.doc === doc)
    if (!a) {
      a = { id: String(nextArtifact++), doc, title }
      setArtifacts([...artifacts, a])
    }
    setTab(`art:${a.id}`)
    dismiss()
  }
  const closeArtifact = (id: string) => {
    setArtifacts((as) => as.filter((a) => a.id !== id))
    if (tab === `art:${id}`) setTab(beside(tab))
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
    if (tab === 'changes') setTab(beside(tab))
  }
  const closeGraph = () => {
    setGraphTab(false)
    if (tab === 'graph') setTab(beside(tab))
  }
  const closeCommit = () => {
    setCommitTab(undefined)
    if (tab === 'commit') setTab(beside(tab))
  }
  const closeFile = (path: string) => {
    setFiles((f) => f.filter((p) => p !== path))
    if (tab === `file:${path}`) setTab(beside(tab))
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

  return {
    tab,
    setTab,
    visited,
    visit,
    order,
    beside,
    files,
    artifacts,
    changesTab,
    graphTab,
    graphPath,
    commit,
    setCommit,
    commitTab,
    setCommitTab,
    commitFocus,
    setCommitFocus,
    focus,
    fileLine,
    openFile,
    openChanges,
    openGraph,
    closeChanges,
    closeGraph,
    closeCommit,
    closeFile,
    openArtifact,
    closeArtifact,
    showChange,
    showComment,
  }
}
