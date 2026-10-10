import { ChevronDown, ChevronRight, FileCode, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clickable } from '../a11y'
import { daemon, errorText, type DiffFile, type DiffMode } from '../daemon'
import { totals, type DiffState } from '../useCheckoutDiff'
import { Tokens } from './Code'

const split = (path: string) => {
  const i = path.lastIndexOf('/')
  return [path.slice(i + 1), i > 0 ? path.slice(0, i) : ''] as const
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

  return (
    <div className="changes" ref={root}>
      <div className="changes-toolbar">
        <div className="segmented">
          <button className={mode === 'uncommitted' ? 'on' : ''} onClick={() => onModeChange('uncommitted')}>
            Uncommitted
          </button>
          <button className={mode === 'base' ? 'on' : ''} onClick={() => onModeChange('base')}>
            Branch vs base
          </button>
        </div>
        <span className="muted">
          {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
        </span>
        <Stat add={t.add} del={t.del} />
      </div>
      {diff.loading && <div className="empty">Loading diff…</div>}
      {diff.error && <div className="empty err">{diff.error}</div>}
      {diff.tooLarge && <div className="empty">Diff is too large to display</div>}
      {!diff.loading && !diff.error && diff.files.length === 0 && <div className="empty">No changes</div>}
      {diff.files.map((f) => {
        const [name, dir] = split(f.path)
        const open = !collapsed.has(f.path)
        return (
          <section key={f.path} className="excerpt" data-path={f.path}>
            <header className="excerpt-head" aria-expanded={open} {...clickable(() => toggle(f.path))}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                  title="Open file"
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
                  title="Discard changes"
                  onClick={(e) => {
                    e.stopPropagation()
                    void discard(f)
                  }}
                >
                  <Undo2 size={14} />
                </button>
              )}
            </header>
            {open && <FileHunks file={f} />}
          </section>
        )
      })}
    </div>
  )
}

function FileHunks({ file }: { file: DiffFile }) {
  if (file.status === 'binary') return <div className="empty">Binary file</div>
  if (file.status === 'too_large') return <div className="empty">File diff is too large to display</div>
  return (
    <div className="hunks">
      {file.hunks.map((h, i) => {
        let oldNo = h.oldStart
        let newNo = h.newStart
        return (
          <div key={i}>
            {i > 0 && <div className="hunk-sep" />}
            {h.lines.map((l, j) => {
              if (l.type === 'header') return null
              const o = l.type === 'add' ? '' : oldNo++
              const n = l.type === 'remove' ? '' : newNo++
              return (
                <div key={j} className={`dl ${l.type}`}>
                  <span className="ln">{o}</span>
                  <span className="ln">{n}</span>
                  <span className="dc">{l.tokens ? <Tokens tokens={l.tokens} /> : l.content || ' '}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
