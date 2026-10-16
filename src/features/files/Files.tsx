import { isLanguageSupported } from '@getpaseo/highlight'
import { ChevronRight, File, FileCode, FolderClosed, FolderOpen, History, RefreshCw } from 'lucide-react'
import { Fragment, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { clickable } from '../../a11y'
import { placeMenu } from '../../components/menu'
import { OpenFileContext } from '../../openFile'
import { errorText, type DirEntry } from '../../daemon'
import { useReview } from '../review/review'
import { useDaemon } from '../../store'
import { Code } from '../../components/Code'
import { CommentNav, ReviewThread } from '../review/ReviewThread'

const sortEntries = (entries: DirEntry[]) =>
  entries
    .filter((e) => e.name !== '.git')
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))

/** Without `rootName`, lists `dir` with no header row (the path dropdown). */
export function FileTree({
  cwd,
  rootName,
  dir = '.',
  onOpen,
  activePath,
}: {
  cwd: string
  rootName?: string
  dir?: string
  onOpen: (path: string) => void
  activePath?: string
}) {
  const daemon = useDaemon()
  const [dirs, setDirs] = useState<Record<string, DirEntry[] | string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(
    (path: string) =>
      daemon.listDirectory(cwd, path).then(
        (r) => setDirs((d) => ({ ...d, [path]: sortEntries(r.entries) })),
        (e) => setDirs((d) => ({ ...d, [path]: errorText(e) })),
      ),
    [daemon, cwd],
  )

  useEffect(() => void load(dir), [load, dir])

  const toggle = (path: string) => {
    const next = new Set(expanded)
    if (!next.delete(path)) {
      next.add(path)
      if (!dirs[path]) void load(path)
    }
    setExpanded(next)
  }

  const refresh = () => [...expanded, dir].forEach((p) => void load(p))

  const render = (path: string, depth: number): React.ReactNode => {
    const entries = dirs[path]
    if (entries === undefined) return <div className="row muted" style={{ paddingLeft: 8 + depth * 14 }}>Loading…</div>
    if (typeof entries === 'string') return <div className="row err" style={{ paddingLeft: 8 + depth * 14 }}>{entries}</div>
    return entries.map((e) => {
      const isDir = e.kind === 'directory'
      const open = expanded.has(e.path)
      const Icon = isDir ? (open ? FolderOpen : FolderClosed) : isLanguageSupported(e.name) ? FileCode : File
      return (
        <div key={e.path}>
          <div
            className={`row file ${activePath === e.path ? 'active' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            aria-expanded={isDir ? open : undefined}
            {...clickable(() => (isDir ? toggle(e.path) : onOpen(e.path)))}
            title={e.path}
          >
            <ChevronRight size={12} className={`chev ${open ? 'rot90' : ''}`} style={{ visibility: isDir ? 'visible' : 'hidden' }} />
            <Icon size={14} className="muted" />
            <span className="truncate">{e.name}</span>
          </div>
          {isDir && open && render(e.path, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="file-tree">
      {rootName !== undefined && (
        <div className="row panel-root">
          <FolderOpen size={14} className="muted" />
          <span className="grow truncate">{rootName}</span>
          <button className="icon-btn" title="Refresh" onClick={refresh}>
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      {render(dir, 0)}
    </div>
  )
}

type Loaded = { kind: 'text'; text: string } | { kind: 'image'; url: string } | { kind: 'binary' } | { kind: 'error'; message: string }

/** `onHistory` shows the file's commits; pass it only in git workspaces. `reveal`: the line to scroll to, once loaded. */
export function FileView({ cwd, path, reveal, onHistory }: { cwd: string; path: string; reveal?: { line: number }; onHistory?: () => void }) {
  const daemon = useDaemon()
  const [file, setFile] = useState<Loaded | null>(null)
  const review = useReview(cwd)
  const root = useRef<HTMLDivElement>(null)
  const openFile = useContext(OpenFileContext)
  const menuId = `crumbs-${useId()}`
  // The segment whose siblings the dropdown lists; null while it's closed.
  const [crumb, setCrumb] = useState<number | null>(null)
  const parts = path.split('/')
  useEffect(() => {
    let url: string | undefined
    let alive = true
    daemon.readFile(cwd, path, undefined, 2 * 1024 * 1024).then(
      (f) => {
        if (!alive) return
        if (f.kind === 'text') setFile({ kind: 'text', text: new TextDecoder().decode(f.bytes) })
        else if (f.kind === 'image') setFile({ kind: 'image', url: (url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }))) })
        else setFile({ kind: 'binary' })
      },
      (e) => alive && setFile({ kind: 'error', message: errorText(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [daemon, cwd, path])
  useEffect(() => {
    if (reveal && file?.kind === 'text') root.current?.querySelectorAll(':scope > pre > .code-line')[reveal.line - 1]?.scrollIntoView({ block: 'center' })
  }, [reveal, file])

  return (
    <div className="file-view" data-path={path} ref={root}>
      <div className="file-path">
        {review.comments.some((c) => c.path === path) && <CommentNav root={root} />}
        <span className="grow truncate">
          {parts.map(
            (p, i) =>
              p && (
                <Fragment key={i}>
                  {i > 0 && '/'}
                  <button
                    className="crumb"
                    popoverTarget={menuId}
                    onClick={(e) => {
                      placeMenu(menuId)(e)
                      // Another segment while open: switch the list instead of closing it.
                      if (crumb !== null && crumb !== i) e.preventDefault()
                      setCrumb(i)
                    }}
                  >
                    {p}
                  </button>
                </Fragment>
              ),
          )}
        </span>
        {onHistory && (
          <button className="icon-btn" title="History" onClick={onHistory}>
            <History size={13} />
          </button>
        )}
      </div>
      <div id={menuId} popover="auto" className="menu crumb-menu" onToggle={(e) => e.newState === 'closed' && setCrumb(null)}>
        {crumb !== null && (
          <FileTree
            key={crumb}
            cwd={cwd}
            dir={parts.slice(0, crumb).join('/') || (crumb ? '/' : '.')}
            activePath={parts.slice(0, crumb + 1).join('/')}
            onOpen={(p) => {
              document.getElementById(menuId)?.hidePopover()
              openFile(p)
            }}
          />
        )}
      </div>
      {!file ? (
        <div className="empty">Loading…</div>
      ) : file.kind === 'text' ? (
        <Code code={file.text} filename={path} lineNumbers after={(n) => <ReviewThread review={review} path={path} side="new" line={n} />} />
      ) : file.kind === 'image' ? (
        <img className="file-image" src={file.url} alt={path} />
      ) : file.kind === 'binary' ? (
        <div className="empty">Binary file</div>
      ) : (
        <div className="empty err">{file.message}</div>
      )}
    </div>
  )
}
