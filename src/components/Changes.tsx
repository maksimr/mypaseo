import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileCode,
  GitBranch,
  Minus,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clickable, useEscape } from '../a11y'
import { chunkKey, chunkPatch, chunks, restoreChunk, stagedKeys, stagedState, type Chunk } from '../chunks'
import { daemon, errorText, type DiffFile, type DiffMode } from '../daemon'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { totals, type DiffState } from '../useCheckoutDiff'
import { Tokens } from './Code'

const split = (path: string) => {
  const i = path.lastIndexOf('/')
  return [path.slice(i + 1), i > 0 ? path.slice(0, i) : ''] as const
}

// RPCs of the mypaseo-git daemon plugin, see paseo-plugin/index.server.ts.
const git = (method: string, input: object) => daemon.invokePluginRpc('mypaseo-git', method, input)

// Toolbar 38px + .excerpt-head 34px (index.css): a chunk right under them is at the top of the view.
const HEADERS = 72
const topOf = (el: Element) => el.getBoundingClientRect().top
const chunkEls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.chunk')]
/** The chunk at the top of the view, else the next one below it. The toolbar's Stage/Unstage act on it. */
const currentChunk = (root: HTMLElement) =>
  chunkEls(root).find((el) => el.getBoundingClientRect().bottom > topOf(root) + HEADERS + 1)

function goToChunk(root: HTMLElement, dir: number) {
  const y = topOf(root) + HEADERS
  const els = chunkEls(root)
  const el = dir > 0 ? els.find((e) => topOf(e) > y + 1) : els.findLast((e) => topOf(e) < y - 1)
  el?.scrollIntoView({ block: 'start' })
}

const fileStatus = (f: DiffFile) => (f.isNew ? 'A' : f.isDeleted ? 'D' : f.oldPath ? 'R' : 'M')

export function ChangesList({ diff, onPick }: { diff: DiffState; onPick: (path: string) => void }) {
  if (diff.error) return <div className="empty err">{diff.error}</div>
  if (!diff.loading && diff.files.length === 0) return <div className="empty">No changes</div>
  return (
    <div className="changes-list">
      {diff.files.map((f) => {
        const [name, dir] = split(f.path)
        return (
          <div key={f.path} className="row file" {...clickable(() => onPick(f.path))} title={f.path}>
            <span className={`status s-${fileStatus(f)}`}>{fileStatus(f)}</span>
            <span className="truncate grow">
              {name} <span className="faint">{dir}</span>
            </span>
            <Stat add={f.additions} del={f.deletions} />
          </div>
        )
      })}
    </div>
  )
}

const Stat = ({ add, del }: { add: number; del: number }) => (
  <span className="stat">
    {add > 0 && <span className="add">+{add}</span>}
    {del > 0 && <span className="del">−{del}</span>}
  </span>
)

/** Zed-style multibuffer: every changed file stacked in one scrollable view. */
export function ChangesView({
  cwd,
  diff,
  mode,
  onModeChange,
  focus,
  onOpenFile,
}: {
  cwd: string
  diff: DiffState
  mode: DiffMode
  onModeChange: (m: DiffMode) => void
  focus: { path: string; n: number } | null
  onOpenFile: (path: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const root = useRef<HTMLDivElement>(null)
  const t = totals(diff.files)
  // Staged chunk keys per path; stays null when the plugin isn't installed, which hides Stage.
  const [index, setIndex] = useState<{ cwd: string; keys: Map<string, Set<string>> } | null>(null)
  const [indexTick, setIndexTick] = useState(0)
  const keys = mode === 'uncommitted' && index?.cwd === cwd ? index.keys : undefined
  // Staged state of the chunk at the top of the view; null when there is none.
  const [current, setCurrent] = useState<boolean | null>(null)
  const [committing, setCommitting] = useState(false)
  const prevKey = useShortcut('prevHunk')
  const nextKey = useShortcut('nextHunk')
  const commitKey = useShortcut('commit')
  const stageAllKey = useShortcut('stageAll')
  const canCommit = !!keys && keys.size > 0
  const allCollapsed = diff.files.length > 0 && diff.files.every((f) => collapsed.has(f.path))
  const allStaged = !!keys && diff.files.length > 0 && diff.files.every((f) => stagedState(f.hunks, keys.get(f.path)) === 'all')

  const syncCurrent = () => {
    const el = root.current && currentChunk(root.current)
    setCurrent(el ? el.classList.contains('staged') : null)
  }
  useEffect(syncCurrent, [diff.files, index, collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = isShortcut(e, 'nextHunk') ? 1 : isShortcut(e, 'prevHunk') ? -1 : 0
      if (!dir || !root.current) return
      e.preventDefault()
      goToChunk(root.current, dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!canCommit) return
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: the open dialog already took the same combo as Commit.
      if (e.defaultPrevented || !isShortcut(e, 'commit')) return
      e.preventDefault()
      setCommitting(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCommit])

  // Re-read on every diff push: the daemon diff is HEAD→worktree, so it doesn't carry index state itself.
  useEffect(() => {
    if (mode !== 'uncommitted') return
    let live = true
    git('index.diff', { cwd }).then(
      (r) => live && setIndex({ cwd, keys: stagedKeys((r as { files: Record<string, string> }).files) }),
      () => live && setIndex(null),
    )
    return () => {
      live = false
    }
  }, [cwd, mode, diff.files, indexTick])

  useEffect(() => {
    if (!focus) return
    requestAnimationFrame(() =>
      root.current?.querySelector(`[data-path="${CSS.escape(focus.path)}"]`)?.scrollIntoView({ block: 'start' }),
    )
  }, [focus])

  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const discard = async (f: DiffFile) => {
    if (!confirm(`Discard all changes to ${f.path}?${f.isNew ? ' The file will be deleted.' : ''}`)) return
    try {
      const r = await daemon.checkoutDiscardChanges(cwd, { paths: f.oldPath ? [f.path, f.oldPath] : [f.path] })
      if (r.error) alert(r.error.message)
    } catch (e) {
      alert(errorText(e))
    }
  }

  const setFileStaged = (f: DiffFile, stage: boolean) =>
    git(stage ? 'index.add' : 'index.reset', { cwd, paths: [f.path] })

  // A new or deleted file is one chunk, so it's staged as a whole file.
  const setStaged = (f: DiffFile, cs: Chunk[], i: number, stage: boolean) =>
    f.isNew || f.isDeleted
      ? setFileStaged(f, stage)
      : git('index.apply', { cwd, patch: chunkPatch(f.path, cs, i), reverse: !stage })

  const runIndex = async (op: Promise<unknown>) => {
    try {
      await op
    } catch (e) {
      alert(errorText(e))
    }
    setIndexTick((n) => n + 1)
  }

  // Zed's "stage and next": act on the chunk at the top, then bring the next one up.
  const stageCurrent = async (stage: boolean) => {
    const el = root.current && currentChunk(root.current)
    const f = diff.files.find((f) => f.path === el?.closest<HTMLElement>('[data-path]')?.dataset.path)
    if (!el || !f) return
    const els = chunkEls(root.current!)
    await runIndex(setStaged(f, chunks(f.hunks[Number(el.dataset.hunk)]), Number(el.dataset.chunk), stage))
    els[els.indexOf(el) + 1]?.scrollIntoView({ block: 'start' })
  }

  const allPaths = () => diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]))
  const stageAll = () => void runIndex(git('index.add', { cwd, paths: allPaths() }))
  const canStageAll = !!keys && diff.files.length > 0 && !allStaged

  useEffect(() => {
    if (!canStageAll) return
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'stageAll')) return
      e.preventDefault()
      stageAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // stageAll reads the render's diff, so it re-binds every render

  const restore = async (f: DiffFile, cs: Chunk[], i: number, staged: boolean) => {
    // A new or deleted file is one chunk, so restoring it discards the file.
    if (f.isNew || f.isDeleted) return discard(f)
    const c = cs[i]
    try {
      // Unstage first, or the index would keep a change the worktree no longer has.
      if (staged) await setStaged(f, cs, i, false)
      const cur = await daemon.readFile(cwd, f.path)
      // fatal: never rewrite a non-UTF-8 file; ignoreBOM: keep the BOM, git counts it as part of line 1.
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(cur.bytes)
      const r = await daemon.writeFile({
        cwd,
        path: f.path,
        content: restoreChunk(text, c),
        expectedModifiedAt: cur.modifiedAt,
        expectedRevision: cur.revision,
      })
      if (r.status !== 'written') alert(r.status === 'error' ? r.error : 'The file changed on disk. Try again.')
    } catch (e) {
      alert(errorText(e))
    }
    if (staged) setIndexTick((n) => n + 1)
  }

  return (
    <div className="changes" ref={root} onScroll={syncCurrent}>
      <div className="changes-toolbar">
        <button
          className="icon-btn"
          title={allCollapsed ? 'Expand All Files' : 'Collapse All Files'}
          onClick={() => setCollapsed(new Set(allCollapsed ? [] : diff.files.map((f) => f.path)))}
        >
          {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        </button>
        <div className="segmented">
          <button className={mode === 'uncommitted' ? 'on' : ''} onClick={() => onModeChange('uncommitted')}>
            Uncommitted
          </button>
          <button className={mode === 'base' ? 'on' : ''} onClick={() => onModeChange('base')}>
            Branch vs Base
          </button>
        </div>
        <span className="grow" />
        <Stat add={t.add} del={t.del} />
        <span className="sep" />
        <button
          className="icon-btn"
          title={`Go to Previous Hunk (${formatCombo(prevKey)})`}
          onClick={() => root.current && goToChunk(root.current, -1)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          className="icon-btn"
          title={`Go to Next Hunk (${formatCombo(nextKey)})`}
          onClick={() => root.current && goToChunk(root.current, 1)}
        >
          <ArrowDown size={14} />
        </button>
        {keys && (
          <>
            <span className="sep" />
            <button
              className="text-btn"
              title="Stage and Go to Next Hunk"
              disabled={current !== false}
              onClick={() => void stageCurrent(true)}
            >
              Stage
            </button>
            <button
              className="text-btn"
              title="Unstage and Go to Next Hunk"
              disabled={current !== true}
              onClick={() => void stageCurrent(false)}
            >
              Unstage
            </button>
            <span className="sep" />
            {allStaged ? (
              <button className="text-btn" onClick={() => void runIndex(git('index.reset', { cwd, paths: allPaths() }))}>
                Unstage All
              </button>
            ) : (
              <button className="text-btn" title={`Stage All (${formatCombo(stageAllKey)})`} disabled={!canStageAll} onClick={stageAll}>
                Stage All
              </button>
            )}
            <span className="sep" />
            <button className="text-btn" title={`Commit (${formatCombo(commitKey)})`} disabled={!canCommit} onClick={() => setCommitting(true)}>
              Commit
            </button>
          </>
        )}
      </div>
      {committing && (
        <CommitDialog
          cwd={cwd}
          onClose={() => setCommitting(false)}
          onDone={() => {
            setCommitting(false)
            setIndexTick((n) => n + 1)
          }}
        />
      )}
      {diff.loading && <div className="empty">Loading diff…</div>}
      {diff.error && <div className="empty err">{diff.error}</div>}
      {diff.tooLarge && <div className="empty">Diff is too large to display</div>}
      {!diff.loading && !diff.error && diff.files.length === 0 && <div className="empty">No changes</div>}
      {diff.files.map((f) => {
        const [name, dir] = split(f.path)
        const open = !collapsed.has(f.path)
        // shortcut: renames don't line up with the plugin's --no-renames index diff, so they can't be staged here.
        const canStage = !!keys && !f.oldPath
        const fileKeys = keys?.get(f.path)
        const staged = stagedState(f.hunks, fileKeys)
        return (
          <section key={f.path} className="excerpt" data-path={f.path}>
            <header className="excerpt-head" aria-expanded={open} {...clickable(() => toggle(f.path))}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {canStage && (
                <button
                  role="checkbox"
                  aria-checked={staged === 'all' ? true : staged === 'some' ? 'mixed' : false}
                  className="check"
                  title={staged === 'all' ? 'Unstage' : 'Stage'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void runIndex(setFileStaged(f, staged !== 'all'))
                  }}
                >
                  {staged === 'all' ? <Check size={12} /> : staged === 'some' && <Minus size={12} />}
                </button>
              )}
              <span className={`status s-${fileStatus(f)}`}>{fileStatus(f)}</span>
              <span className="excerpt-name">{name}</span>
              <span className="faint truncate grow">
                {f.oldPath ? `${f.oldPath} → ` : ''}
                {dir}
              </span>
              <Stat add={f.additions} del={f.deletions} />
              {!f.isDeleted && (
                <button
                  className="icon-btn"
                  title="Open File"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenFile(f.path)
                  }}
                >
                  <FileCode size={14} />
                </button>
              )}
              {mode === 'uncommitted' && (
                <button
                  className="icon-btn"
                  title="Discard Changes"
                  onClick={(e) => {
                    e.stopPropagation()
                    void discard(f)
                  }}
                >
                  <Undo2 size={14} />
                </button>
              )}
            </header>
            {open && (
              <FileHunks
                file={f}
                staged={canStage ? (fileKeys ?? new Set()) : undefined}
                onStage={(cs, i, stage) => void runIndex(setStaged(f, cs, i, stage))}
                onRestore={mode === 'uncommitted' ? (cs, i, staged) => void restore(f, cs, i, staged) : undefined}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Zed-style commit modal: an empty message makes the daemon generate one, an empty amend keeps the last one. */
function CommitDialog({ cwd, onClose, onDone }: { cwd: string; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState('')
  const [signoff, setSignoff] = useState(false)
  const [noVerify, setNoVerify] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [branch, setBranch] = useState<string | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const commitKey = useShortcut('commit')
  const amendKey = useShortcut('amend')
  // Esc with the menu open closes just the menu, not the dialog and its message.
  useEscape(() => !menu.current?.matches(':popover-open') && onClose())

  useEffect(() => {
    let live = true
    daemon.getCheckoutStatus(cwd).then(
      (s) => live && setBranch(s.currentBranch ?? null),
      () => {},
    )
    return () => {
      live = false
    }
  }, [cwd])

  const commit = async (amend: boolean) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // The daemon's commit is the one that generates a message, so it handles the plain case.
      if (amend || signoff || noVerify) await git('commit', { cwd, message, amend, signoff, noVerify })
      else {
        const r = await daemon.checkoutCommit(cwd, { message, addAll: false })
        if (r.error) throw new Error(r.error.message)
      }
      onDone()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  const toggle = (label: string, on: boolean, set: (on: boolean) => void) => (
    <button role="menuitemcheckbox" aria-checked={on} popoverTarget="commit-menu" popoverTargetAction="hide" onClick={() => set(!on)}>
      <Check size={14} style={{ visibility: on ? 'visible' : 'hidden' }} /> {label}
    </button>
  )

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="commit-dialog"
        role="dialog"
        aria-label="Commit"
        onKeyDown={(e) => {
          const amend = isShortcut(e, 'amend')
          if (!amend && !isShortcut(e, 'commit')) return
          e.preventDefault()
          void commit(amend)
        }}
      >
        <textarea
          autoFocus
          className="commit-message"
          aria-label="Commit Message"
          placeholder="Enter commit message (leave empty to generate one)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <div className="commit-error err pre-wrap">{error}</div>}
        <footer className="commit-foot">
          {branch && (
            <span className="commit-branch muted truncate">
              <GitBranch size={14} /> {branch}
            </span>
          )}
          <span className="grow" />
          <button className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <div className="split-btn">
            <button disabled={busy} title={`Commit (${formatCombo(commitKey)})`} onClick={() => void commit(false)}>
              {busy ? 'Committing…' : 'Commit'}
            </button>
            <button
              disabled={busy}
              title="Commit Options"
              popoverTarget="commit-menu"
              onClick={(e) => {
                // shortcut: fixed placement under the trigger, like Sidebar's menus; switch to CSS anchor positioning once Baseline.
                const r = e.currentTarget.getBoundingClientRect()
                menu.current!.style.top = `${r.bottom + 4}px`
                menu.current!.style.right = `${innerWidth - r.right}px`
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </footer>
        <div id="commit-menu" ref={menu} popover="auto" className="menu" role="menu">
          <button role="menuitem" popoverTarget="commit-menu" popoverTargetAction="hide" onClick={() => void commit(true)}>
            <Check size={14} style={{ visibility: 'hidden' }} />
            <span className="grow">Amend</span>
            <kbd>{formatCombo(amendKey)}</kbd>
          </button>
          {toggle('Signoff', signoff, setSignoff)}
          {toggle('Skip Hooks', noVerify, setNoVerify)}
        </div>
      </div>
    </div>
  )
}

type ChunkAction = (cs: Chunk[], i: number, flag: boolean) => void

function FileHunks({
  file,
  staged,
  onStage,
  onRestore,
}: {
  file: DiffFile
  staged?: Set<string>
  onStage: ChunkAction
  onRestore?: ChunkAction
}) {
  if (file.status === 'binary') return <div className="empty">Binary file</div>
  if (file.status === 'too_large') return <div className="empty">File diff is too large to display</div>
  return (
    <div className="hunks">
      {file.hunks.map((h, i) => {
        const cs = chunks(h)
        return (
          <div key={i}>
            {i > 0 && <div className="hunk-sep" />}
            {cs.map((c, j) => {
              const isStaged = c.change && !!staged?.has(chunkKey(c))
              return (
                <div
                  key={j}
                  className={c.change ? (isStaged ? 'chunk staged' : 'chunk') : undefined}
                  data-hunk={i}
                  data-chunk={j}
                >
                  {c.change && onRestore && (
                    <div className="chunk-actions">
                      {staged && (
                        <button className="text-btn" onClick={() => onStage(cs, j, !isStaged)}>
                          {isStaged ? 'Unstage' : 'Stage'}
                        </button>
                      )}
                      <button className="text-btn" onClick={() => onRestore(cs, j, isStaged)}>
                        Restore
                      </button>
                    </div>
                  )}
                  {c.rows.map((l, k) => (
                    <div key={k} className={`dl ${l.type}`}>
                      <span className="ln">{l.o}</span>
                      <span className="ln">{l.n}</span>
                      <span className="dc">{l.tokens ? <Tokens tokens={l.tokens} /> : l.content || ' '}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
