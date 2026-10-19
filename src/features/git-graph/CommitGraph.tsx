import { CaseSensitive, Check, ChevronDown, ChevronUp, GitBranch, Hash, Mail, Tag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clickable } from '../../a11y'
import { errorText, type DiffFile, type Workspace } from '../../daemon'
import * as git from '../../git'
import { isShortcut } from '../../keymap'
import { layout, type GraphLine } from './graph'
import { useDaemon } from '../../store'
import { split } from '../changes/useCheckoutDiff'
import { Stat } from '../changes/Changes'

// shortcut: only the newest LIMIT commits load, add paging when someone needs older history.
const LIMIT = 1000
const ROW = 28 // .graph-row height in graph.css
const LANE = 16
const R = 6 // corner radius where a line turns between lanes
const REFS_W = 200 // default room left of the lanes for a commit's first ref and its +N badge
const MIN_REFS = 72 // narrower, a ref pill shows no text, so refs hide
const PHONE = '(width < 600px)' // the phone media query in graph.css, which hides date, author and sha
const LANES = 7 // --lane-0 … --lane-6 in styles/theme.css
/** A CSS color: goes in style, as SVG attributes don't take var(). */
const color = (lane: number) => `var(--lane-${lane % LANES})`
const x = (lane: number) => 12 + lane * LANE
const y = (row: number) => row * ROW + ROW / 2
// en-US for "Sep", not en-GB's "Sept"; parts reordered since neither locale has this layout.
const dateParts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
/** "11 Oct 2026 23:55" in local time. */
const formatDate = (iso: string) => {
  const p = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day} ${p.month} ${p.year} ${p.hour}:${p.minute}`
}

/** Leaves a commit sideways into the line's own lane, runs down it, then turns sideways into the next commit. */
function linePath(l: GraphLine, row: number) {
  const [x1, y1, xl, x2, y2] = [x(l.from), y(row), x(l.lane), x(l.to), y(row + 1)]
  let d = `M${x1} ${y1}`
  if (x1 !== xl) d += `H${xl - Math.sign(xl - x1) * R}Q${xl} ${y1} ${xl} ${y1 + R}`
  return x2 === xl ? `${d}V${y2}` : `${d}V${y2 - R}Q${xl} ${y2} ${xl + Math.sign(x2 - xl) * R} ${y2}H${x2}`
}

type Cols = { graph?: number; date: number; author: number; sha: number }
const [MIN_COL, MAX_COL] = [40, 600]

/** Drag handle in the header gap before grid column `col`; `dir` is +1 when it sizes the column on its left, -1 the one on its right. */
function ColResizer({ col, dir, label, width, onResize }: { col: number; dir: 1 | -1; label: string; width: number; onResize: (w: number) => void }) {
  const start = useRef({ x: 0, w: 0 })
  return (
    <div
      className="resizer graph-resizer"
      style={{ gridColumn: col }}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_COL}
      aria-valuemax={MAX_COL}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault() // no text selection while dragging
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: width }
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(start.current.w + dir * (e.clientX - start.current.x))
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0
        if (!d) return
        e.preventDefault()
        onResize(width + dir * d)
      }}
    />
  )
}

function Ref({ name }: { name: string }) {
  const tag = name.startsWith('tag: ')
  return (
    <span className="graph-ref" title={name}>
      {name.startsWith('HEAD') ? <Check size={12} /> : tag ? <Tag size={12} /> : <GitBranch size={12} />}
      <span className="truncate">{tag ? name.slice(5) : name.replace(' -> ', ' → ')}</span>
    </span>
  )
}

/** A commit's first ref, a +N badge listing the rest on hover, and a dashed line over to the commit's dot. */
function Refs({ refs: [first, ...rest] }: { refs: string[] }) {
  return (
    <span className="graph-refs">
      <span className="graph-labels">
        <Ref name={first} />
        {rest.length > 0 && (
          <span className="graph-more">
            +{rest.length}
            <span role="tooltip" className="graph-more-list">
              {rest.map((r) => (
                <div key={r}>- {r}</div>
              ))}
            </span>
          </span>
        )}
      </span>
      <span className="graph-dash" />
    </span>
  )
}

/** Every branch, remote and tag of the workspace's repo as a commit graph, with find-in-list search; with `path`, that file's history. */
export function CommitGraph({
  workspace,
  files,
  path,
  selected,
  onSelect,
}: {
  workspace: Workspace
  files: DiffFile[]
  path?: string
  selected?: string
  onSelect: (sha: string) => void
}) {
  const daemon = useDaemon()
  const cwd = workspace.workspaceDirectory
  const [log, setLog] = useState<{ cwd: string; commits: git.Commit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Commits, pulls and branch switches change the branch status or the diff, so re-read on either.
  const runtime = JSON.stringify(workspace.gitRuntime)
  useEffect(() => {
    let live = true
    git.log(daemon, { cwd, limit: LIMIT, path }).then(
      (r) => {
        if (!live) return
        setLog({ cwd, commits: r.commits })
        setError(null)
      },
      (e) => live && setError(errorText(e)),
    )
    return () => {
      live = false
    }
  }, [daemon, cwd, path, runtime, files])

  const commits = useMemo(() => (log?.cwd === cwd ? log.commits : []), [log, cwd])
  const { rows, width } = useMemo(() => layout(commits), [commits])
  const [cols, setCols] = useState<Cols>(() => ({ date: 115, author: 120, sha: 60, ...JSON.parse(localStorage.mypaseoGraphColumns ?? '{}') }))
  const resize = (k: keyof Cols) => (w: number) => {
    const next = { ...cols, [k]: Math.round(Math.min(Math.max(w, MIN_COL), MAX_COL)) }
    setCols(next)
    localStorage.mypaseoGraphColumns = JSON.stringify(next)
  }
  const pane = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(0)
  useEffect(() => {
    const el = pane.current
    if (!el) return
    const ro = new ResizeObserver(() => setPaneW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Lanes sit at the column's right and fit up to 7; wider lanes clip. Refs get the rest of the column.
  const lanesW = Math.min(x(width) + 4, x(6) + 12)
  // Until dragged, the graph column takes at most 2/5 of the width it shares with the description, which matters more.
  // matchMedia in render is enough: a viewport resize also resizes the pane, which re-renders.
  const others = matchMedia(PHONE).matches ? 0 : cols.date + cols.author + cols.sha + 36 // + their 3 gaps
  const shared = paneW - 24 // the row's right padding and the graph-description gap
  const fit = commits.some((c) => c.refs.length) ? Math.min(REFS_W, Math.round(((shared - others) * 2) / 5 - lanesW)) : 0
  const graphW = cols.graph ?? Math.max(64, (fit < MIN_REFS ? 0 : fit) + lanesW)
  const refsW = Math.max(0, graphW - lanesW)
  const lines = useMemo(
    () => (
      <svg className="graph-lines" height={rows.length * ROW} aria-hidden>
        {rows.flatMap((r, i) => r.lines.map((l, j) => <path key={`${i}.${j}`} d={linePath(l, i)} style={{ stroke: color(l.lane) }} />))}
        {rows.map((r, i) => (
          <circle key={i} cx={x(r.lane)} cy={y(i)} r={4} style={{ stroke: color(r.lane) }} />
        ))}
      </svg>
    ),
    [rows],
  )

  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [cur, setCur] = useState(0)
  const norm = (s: string) => (matchCase ? s : s.toLowerCase())
  const q = norm(query.trim())
  const matches = q ? commits.flatMap((c, i) => ([c.subject, c.author, c.sha, ...c.refs].some((s) => norm(s).includes(q)) ? [i] : [])) : []
  const matched = new Set(matches)
  const at = Math.min(cur, matches.length - 1)
  const current = matches[at]
  const go = (step: number) => matches.length && setCur((at + step + matches.length) % matches.length)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (current !== undefined) body.current?.children[current + 1]?.scrollIntoView({ block: 'nearest' }) // +1: the svg
  }, [current])
  // Search in List: the graph has its own search box, so `/` from the graph's rows goes there.
  const searchBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'listSearch') || !(e.target instanceof Node) || !pane.current?.contains(e.target) || e.target === searchBox.current) return
      e.preventDefault()
      searchBox.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="graph"
      ref={pane}
      tabIndex={-1} // App focuses the shown view when a side pane closes, so arrow keys scroll it
      style={{ '--graph-w': `${graphW}px`, '--refs-w': `${refsW}px`, '--date-w': `${cols.date}px`, '--author-w': `${cols.author}px`, '--sha-w': `${cols.sha}px` } as CSSProperties}
    >
      <div className="graph-toolbar" role="toolbar" aria-label="Git Graph">
        <input
          ref={searchBox}
          className="input grow"
          placeholder="Search commits…"
          aria-label="Search Commits"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCur(0)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            go(e.shiftKey ? -1 : 1)
          }}
        />
        {query && (
          <span className="graph-count">
            {matches.length ? at + 1 : 0}/{matches.length}
          </span>
        )}
        <button className={`icon-btn ${matchCase ? 'on' : ''}`} title="Match Case" aria-pressed={matchCase} onClick={() => setMatchCase(!matchCase)}>
          <CaseSensitive size={15} />
        </button>
        <button className="icon-btn" title="Previous Match (Shift+Enter)" disabled={!matches.length} onClick={() => go(-1)}>
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn" title="Next Match (Enter)" disabled={!matches.length} onClick={() => go(1)}>
          <ChevronDown size={14} />
        </button>
      </div>
      {error && <div className="empty err">{error}. The graph comes from the mypaseo-git daemon plugin, see the README to install or reload it.</div>}
      {!error && !log && <div className="empty">Loading…</div>}
      {!error && log && commits.length === 0 && <div className="empty">No commits</div>}
      {commits.length > 0 && (
        <>
          <div className="graph-row graph-head">
            <span className="truncate">Graph</span>
            <span className="truncate">Description</span>
            <span className="truncate">Date</span>
            <span className="truncate">Author</span>
            <span className="truncate">Commit</span>
            <ColResizer col={2} dir={1} label="Resize Graph Column" width={graphW} onResize={resize('graph')} />
            <ColResizer col={3} dir={-1} label="Resize Date Column" width={cols.date} onResize={resize('date')} />
            <ColResizer col={4} dir={-1} label="Resize Author Column" width={cols.author} onResize={resize('author')} />
            <ColResizer col={5} dir={-1} label="Resize Commit Column" width={cols.sha} onResize={resize('sha')} />
          </div>
          <div className="graph-body" ref={body}>
            {lines}
            {commits.map((c, i) => (
              <div
                key={c.sha}
                className={`graph-row ${matched.has(i) ? 'match' : ''} ${i === current ? 'current' : ''} ${c.sha === selected ? 'selected' : ''}`}
                style={{ '--c': color(rows[i].lane), '--x': `${x(rows[i].lane)}px` } as CSSProperties}
                {...clickable(() => onSelect(c.sha))}
              >
                {c.refs.length && refsW >= MIN_REFS ? <Refs refs={c.refs} /> : <span />}
                <span className="truncate" title={c.subject}>
                  {c.subject}
                </span>
                <span className="truncate muted">{formatDate(c.date)}</span>
                <span className="truncate muted" title={c.author}>
                  {c.author}
                </span>
                <span className="truncate mono muted" title={c.sha}>
                  {c.sha.slice(0, 7)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Right panel view of the commit picked in the git graph: message, author, date, hash and changed files. */
export function CommitDetails({
  cwd,
  sha,
  onPick,
}: {
  cwd: string
  sha: string
  onPick: (path: string) => void
}) {
  const daemon = useDaemon()
  const [details, setDetails] = useState<git.CommitInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    git.show(daemon, { cwd, sha }).then(
      (r) => live && setDetails(r),
      (e) => live && setError(errorText(e)),
    )
    return () => {
      live = false
    }
  }, [daemon, cwd, sha])

  if (error) return <div className="empty err">{error}</div>
  if (!details) return <div className="empty">Loading…</div>
  const [subject, ...rest] = details.message.split('\n')
  const body = rest.join('\n').trim()
  return (
    <div className="changes-list">
      <div className="commit-author">
        <div className="commit-author-name">{details.author}</div>
        <div>{formatDate(details.date)}</div>
      </div>
      <div className="commit-meta">
        <div title="Email">
          <Mail size={13} />
          <span className="truncate">{details.email}</span>
        </div>
        <div title={sha}>
          <Hash size={13} />
          <span className="truncate">{sha}</span>
        </div>
      </div>
      <div className="commit-text">
        <div>{subject}</div>
        {body && <div className="pre-wrap muted">{body}</div>}
      </div>
      {details.files.length === 0 && <div className="empty">No changes</div>}
      {details.files.map((f) => {
        const [name, dir] = split(f.path)
        return (
          <div key={f.path} className="row file" {...clickable(() => onPick(f.path))} title={f.path}>
            <span className={`status s-${f.status}`}>{f.status}</span>
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
