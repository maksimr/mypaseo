import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  FileCode,
  GitBranch,
  Loader2,
  Minus,
  Undo2,
} from 'lucide-react'
import { Fragment, useContext, useEffect, useRef, useState } from 'react'
import { clickable, useEscape } from '../a11y'
import { ActiveViewContext } from '../activeView'
import { chunkKey, chunkPatch, chunks, restoreChunk, stagedKeys, stagedState, type Chunk } from '../chunks'
import { errorText, type DiffFile } from '../daemon'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { useReview } from '../review'
import { useDaemon } from '../store'
import { split, totals, type DiffState } from '../useCheckoutDiff'
import { Pick } from './Chat'
import { Tokens } from './Code'
import { CommentNav, ReviewThread } from './Review'

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

type Filter = 'all' | 'staged' | 'unstaged'

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

export const Stat = ({ add, del }: { add: number; del: number }) => (
  <span className="stat">
    {add > 0 && <span className="add">+{add}</span>}
    {del > 0 && <span className="del">−{del}</span>}
  </span>
)

/** Zed-style multibuffer: every changed file stacked in one scrollable view. readOnly: a commit's diff, with no index, discard or restore. */
export function ChangesView({
  cwd,
  diff,
  focus,
  onOpenFile,
  readOnly,
}: {
  cwd: string
  diff: DiffState
  focus: { path: string; n: number } | null
  onOpenFile: (path: string) => void
  readOnly?: boolean
}) {
  const daemon = useDaemon()
  // RPCs of the mypaseo-git daemon plugin, see paseo-plugin/index.server.ts.
  const git = (method: string, input: object) => daemon.invokePluginRpc('mypaseo-git', method, input)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const root = useRef<HTMLDivElement>(null)
  const t = totals(diff.files)
  // Staged chunk keys per path; stays null when the plugin isn't installed, which hides Stage.
  const [index, setIndex] = useState<{ cwd: string; keys: Map<string, Set<string>> } | null>(null)
  const [indexTick, setIndexTick] = useState(0)
  const keys = index?.cwd === cwd ? index.keys : undefined
  const [filterPick, setFilter] = useState<Filter>('all')
  // Without the plugin there's no index state to filter by.
  const filter = keys ? filterPick : 'all'
  // Renames can't be staged here (see canStage below), so they count as unstaged.
  const fileState = (f: DiffFile) => (keys && !f.oldPath ? stagedState(f.hunks, keys.get(f.path)) : 'none')
  const shown = filter === 'all' ? diff.files : diff.files.filter((f) => fileState(f) !== (filter === 'staged' ? 'none' : 'all'))
  const review = useReview(cwd)
  const commented = review.comments.some((c) => shown.some((f) => f.path === c.path))
  // Staged state of the chunk at the top of the view; null when there is none.
  const [current, setCurrent] = useState<boolean | null>(null)
  const [committing, setCommitting] = useState(false)
  const [commitBusy, setCommitBusy] = useState(false)
  // A failed commit reopens the dialog with what the user typed and the error.
  const [failed, setFailed] = useState<{ input: CommitInput; error: string } | null>(null)
  const prevKey = useShortcut('prevHunk')
  const nextKey = useShortcut('nextHunk')
  const commitKey = useShortcut('commit')
  const stageAllKey = useShortcut('stageAll')
  const canCommit = !!keys && keys.size > 0 && !commitBusy
  const allCollapsed = diff.files.length > 0 && diff.files.every((f) => collapsed.has(f.path))
  const allStaged = !!keys && diff.files.length > 0 && diff.files.every((f) => stagedState(f.hunks, keys.get(f.path)) === 'all')

  const syncCurrent = () => {
    const el = root.current && currentChunk(root.current)
    setCurrent(el ? el.classList.contains('staged') : null)
  }
  useEffect(syncCurrent, [diff.files, index, collapsed])

  // Kept mounted behind another tab, the view leaves the shortcuts to the shown one.
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const dir = isShortcut(e, 'nextHunk') ? 1 : isShortcut(e, 'prevHunk') ? -1 : 0
      if (!dir || !root.current) return
      e.preventDefault()
      goToChunk(root.current, dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  useEffect(() => {
    if (!active || !canCommit) return
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: the open dialog already took the same combo as Commit.
      if (e.defaultPrevented || !isShortcut(e, 'commit')) return
      e.preventDefault()
      setCommitting(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, canCommit])

  // Re-read on every diff push: the daemon diff is HEAD→worktree, so it doesn't carry index state itself.
  useEffect(() => {
    if (readOnly) return
    let live = true
    daemon.invokePluginRpc('mypaseo-git', 'index.diff', { cwd }).then(
      (r) => live && setIndex({ cwd, keys: stagedKeys((r as { files: Record<string, string> }).files) }),
      () => live && setIndex(null),
    )
    return () => {
      live = false
    }
  }, [daemon, cwd, diff.files, indexTick, readOnly])

  // Scrolls once the focused file is there: a commit's diff can still be loading when a file is picked.
  const scrolledTo = useRef<typeof focus>(null)
  useEffect(() => {
    if (!focus || scrolledTo.current === focus) return
    requestAnimationFrame(() => {
      const el = root.current?.querySelector(`[data-path="${CSS.escape(focus.path)}"]`)
      if (!el) return
      scrolledTo.current = focus
      el.scrollIntoView({ block: 'start' })
    })
  }, [focus, diff.files])

  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const discardPaths = async (question: string, paths: string[]) => {
    if (!confirm(question)) return
    try {
      const r = await daemon.checkoutDiscardChanges(cwd, { paths })
      if (r.error) alert(r.error.message)
    } catch (e) {
      alert(errorText(e))
    }
  }

  const discard = (f: DiffFile) =>
    discardPaths(
      `Discard all changes to ${f.path}?${f.isNew ? ' The file will be deleted.' : ''}`,
      f.oldPath ? [f.path, f.oldPath] : [f.path],
    )

  const discardAll = () => {
    const added = diff.files.filter((f) => f.isNew).length
    const n = diff.files.length
    return discardPaths(
      `Discard all changes to ${n} file${n === 1 ? '' : 's'}?${added ? ` ${added} new file${added === 1 ? '' : 's'} will be deleted.` : ''}`,
      allPaths(),
    )
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

  const commit = async (input: CommitInput) => {
    setCommitting(false)
    setCommitBusy(true)
    try {
      // The daemon's commit is the one that generates a message, so it handles the plain case.
      if (input.amend || input.signoff || input.noVerify) await git('commit', { cwd, ...input })
      else {
        const r = await daemon.checkoutCommit(cwd, { message: input.message, addAll: false })
        if (r.error) throw new Error(r.error.message)
      }
      setFailed(null)
    } catch (e) {
      setFailed({ input, error: errorText(e) })
      setCommitting(true)
    }
    setCommitBusy(false)
    setIndexTick((n) => n + 1)
  }

  const allPaths = () => diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]))
  const stageAll = () => void runIndex(git('index.add', { cwd, paths: allPaths() }))
  const canStageAll = !!keys && diff.files.length > 0 && !allStaged

  useEffect(() => {
    if (!active || !canStageAll) return
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
        {commented && <CommentNav root={root} />}
        <button
          className="icon-btn"
          title={allCollapsed ? 'Expand All Files' : 'Collapse All Files'}
          onClick={() => setCollapsed(new Set(allCollapsed ? [] : diff.files.map((f) => f.path)))}
        >
          {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        </button>
        {keys && (
          <Pick
            title="Filter Changes"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              ['all', 'All'],
              ['staged', 'Staged'],
              ['unstaged', 'Unstaged'],
            ]}
          />
        )}
        <span className="grow" />
        <Stat add={t.add} del={t.del} />
        <span className="sep" />
        <button
          className="icon-btn"
          title={`Go to Previous Hunk (${formatCombo(prevKey)})`}
          onClick={() => root.current && goToChunk(root.current, -1)}
        >
          <ChevronUp size={14} />
        </button>
        <button
          className="icon-btn"
          title={`Go to Next Hunk (${formatCombo(nextKey)})`}
          onClick={() => root.current && goToChunk(root.current, 1)}
        >
          <ChevronDown size={14} />
        </button>
        {!readOnly && (
          <>
            <span className="sep" />
            <button className="text-btn" disabled={diff.files.length === 0} onClick={() => void discardAll()}>
              Discard All
            </button>
          </>
        )}
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
              {commitBusy ? (
                <>
                  <Loader2 size={12} className="spin" style={{ verticalAlign: -2 }} /> Committing…
                </>
              ) : (
                'Commit'
              )}
            </button>
          </>
        )}
      </div>
      {committing && (
        <CommitDialog
          cwd={cwd}
          failed={failed}
          onClose={() => {
            setCommitting(false)
            setFailed(null)
          }}
          onCommit={(input) => void commit(input)}
        />
      )}
      {diff.loading && <div className="empty">Loading diff…</div>}
      {diff.error && <div className="empty err">{diff.error}</div>}
      {diff.tooLarge && <div className="empty">Diff is too large to display</div>}
      {!diff.loading && !diff.error && shown.length === 0 && (
        <div className="empty">{filter === 'all' ? 'No changes' : `No ${filter} changes`}</div>
      )}
      {shown.map((f) => {
        const [name, dir] = split(f.path)
        const open = !collapsed.has(f.path)
        // shortcut: renames don't line up with the plugin's --no-renames index diff, so they can't be staged here.
        const canStage = !!keys && !f.oldPath
        const fileKeys = keys?.get(f.path)
        const staged = fileState(f)
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
              {!readOnly && (
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
                cwd={cwd}
                file={f}
                staged={canStage ? (fileKeys ?? new Set()) : undefined}
                filter={filter}
                onStage={(cs, i, stage) => void runIndex(setStaged(f, cs, i, stage))}
                onRestore={readOnly ? undefined : (cs, i, staged) => void restore(f, cs, i, staged)}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Zed-style commit modal: an empty message makes the daemon generate one, an empty amend keeps the last one. */
type CommitInput = { message: string; amend: boolean; signoff: boolean; noVerify: boolean }

function CommitDialog({
  cwd,
  failed,
  onClose,
  onCommit,
}: {
  cwd: string
  failed: { input: CommitInput; error: string } | null
  onClose: () => void
  onCommit: (input: CommitInput) => void
}) {
  const [message, setMessage] = useState(failed?.input.message ?? '')
  const [signoff, setSignoff] = useState(failed?.input.signoff ?? false)
  const [noVerify, setNoVerify] = useState(failed?.input.noVerify ?? false)
  const daemon = useDaemon()
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
  }, [daemon, cwd])

  const commit = (amend: boolean) => onCommit({ message, amend, signoff, noVerify })

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
          commit(amend)
        }}
      >
        <textarea
          autoFocus
          className="commit-message"
          rows={2}
          aria-label="Commit Message"
          placeholder="Enter commit message (leave empty to generate one)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {failed && <div className="commit-error err pre-wrap">{failed.error}</div>}
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
            <button title={`Commit (${formatCombo(commitKey)})`} onClick={() => commit(false)}>
              Commit
            </button>
            <button
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
          <button role="menuitem" popoverTarget="commit-menu" popoverTargetAction="hide" onClick={() => commit(true)}>
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

/** A file's hunks; without onRestore they are read-only. */
function FileHunks({
  cwd,
  file,
  staged,
  filter,
  onStage,
  onRestore,
}: {
  cwd: string
  file: DiffFile
  staged?: Set<string>
  filter: Filter
  onStage: ChunkAction
  onRestore?: ChunkAction
}) {
  const review = useReview(cwd)
  if (file.status === 'binary') return <div className="empty">Binary file</div>
  if (file.status === 'too_large') return <div className="empty">File diff is too large to display</div>
  const isStagedChunk = (c: Chunk) => c.change && !!staged?.has(chunkKey(c))
  // Context always shows; a hunk shows when one of its changes does.
  const shows = (c: Chunk) => !c.change || filter === 'all' || isStagedChunk(c) === (filter === 'staged')
  return (
    <div className="hunks">
      {file.hunks
        .map((h, i) => [i, chunks(h)] as const)
        .filter(([, cs]) => cs.some((c) => c.change && shows(c)))
        .map(([i, cs], n) => (
          <div key={i}>
            {n > 0 && <div className="hunk-sep" />}
            {cs.map((c, j) => {
              if (!shows(c)) return null
              const isStaged = isStagedChunk(c)
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
                    <Fragment key={k}>
                      <div className={`dl ${l.type}`}>
                        <span className="ln">{l.o}</span>
                        <span className="ln">{l.n}</span>
                        <span className="dc">{l.tokens ? <Tokens tokens={l.tokens} /> : l.content || ' '}</span>
                      </div>
                      <ReviewThread review={review} path={file.path} side={l.type === 'remove' ? 'old' : 'new'} line={(l.type === 'remove' ? l.o : l.n) as number} />
                    </Fragment>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
    </div>
  )
}
