import { CaseSensitive, Check, ChevronDown, ChevronUp, Hash, Mail, Tag } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clickable } from '../a11y'
import { errorText, type DiffFile, type Workspace } from '../daemon'
import { layout, type GraphLine } from '../graph'
import { useDaemon } from '../store'
import { split, type CommitInfo } from '../useCheckoutDiff'
import { Stat } from './Changes'

/** A commit from the mypaseo-git plugin's `log` RPC, see paseo-plugin/index.server.ts. */
type Commit = { sha: string; parents: string[]; refs: string[]; author: string; date: string; subject: string }

// shortcut: only the newest LIMIT commits load, add paging when someone needs older history.
const LIMIT = 1000
const ROW = 28 // .graph-row height in index.css
const LANE = 16
const R = 6 // corner radius where a line turns between lanes
const COLORS = ['#74ade8', '#e5894a', '#a1c181', '#c678dd', '#dec184', '#56b6c2', '#e06c75']
const color = (lane: number) => COLORS[lane % COLORS.length]
const x = (lane: number) => 12 + lane * LANE
const y = (row: number) => row * ROW + ROW / 2
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Leaves a commit sideways into the line's own lane, runs down it, then turns sideways into the next commit. */
function linePath(l: GraphLine, row: number) {
  const [x1, y1, xl, x2, y2] = [x(l.from), y(row), x(l.lane), x(l.to), y(row + 1)]
  let d = `M${x1} ${y1}`
  if (x1 !== xl) d += `H${xl - Math.sign(xl - x1) * R}Q${xl} ${y1} ${xl} ${y1 + R}`
  return x2 === xl ? `${d}V${y2}` : `${d}V${y2 - R}Q${xl} ${y2} ${xl + Math.sign(x2 - xl) * R} ${y2}H${x2}`
}

function Ref({ name }: { name: string }) {
  const tag = name.startsWith('tag: ')
  return (
    <span className="graph-ref">
      {name.startsWith('HEAD') && <Check size={11} />}
      {tag && <Tag size={11} />}
      {tag ? name.slice(5) : name.replace(' -> ', ' → ')}
    </span>
  )
}

/** Every branch, remote and tag of the workspace's repo as a commit graph, with find-in-list search. */
export function CommitGraph({
  workspace,
  files,
  selected,
  onSelect,
}: {
  workspace: Workspace
  files: DiffFile[]
  selected?: string
  onSelect: (sha: string) => void
}) {
  const daemon = useDaemon()
  const cwd = workspace.workspaceDirectory
  const [log, setLog] = useState<{ cwd: string; commits: Commit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Commits, pulls and branch switches change the branch status or the diff, so re-read on either.
  const runtime = JSON.stringify(workspace.gitRuntime)
  useEffect(() => {
    let live = true
    daemon.invokePluginRpc('mypaseo-git', 'log', { cwd, limit: LIMIT }).then(
      (r) => {
        if (!live) return
        setLog({ cwd, commits: (r as { commits: Commit[] }).commits })
        setError(null)
      },
      (e) => live && setError(errorText(e)),
    )
    return () => {
      live = false
    }
  }, [daemon, cwd, runtime, files])

  const commits = useMemo(() => (log?.cwd === cwd ? log.commits : []), [log, cwd])
  const { rows, width } = useMemo(() => layout(commits), [commits])
  const graphW = Math.max(64, x(width) + 4)
  const lines = useMemo(
    () => (
      <svg className="graph-lines" width={graphW} height={rows.length * ROW} aria-hidden>
        {rows.flatMap((r, i) => r.lines.map((l, j) => <path key={`${i}.${j}`} d={linePath(l, i)} stroke={color(l.lane)} />))}
        {rows.map((r, i) => (
          <circle key={i} cx={x(r.lane)} cy={y(i)} r={3.5} fill={color(r.lane)} />
        ))}
      </svg>
    ),
    [rows, graphW],
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

  return (
    <div className="graph" style={{ '--graph-w': `${graphW}px` } as CSSProperties}>
      <div className="graph-toolbar">
        <input
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
        <button className={`icon-btn ${matchCase ? 'on' : ''}`} title="Match Case" aria-pressed={matchCase} onClick={() => setMatchCase(!matchCase)}>
          <CaseSensitive size={15} />
        </button>
        <button className="icon-btn" title="Previous Match (Shift+Enter)" disabled={!matches.length} onClick={() => go(-1)}>
          <ChevronUp size={14} />
        </button>
        <button className="icon-btn" title="Next Match (Enter)" disabled={!matches.length} onClick={() => go(1)}>
          <ChevronDown size={14} />
        </button>
        <span className="muted graph-count">
          {matches.length ? at + 1 : 0}/{matches.length}
        </span>
      </div>
      {error && <div className="empty err">{error}. The graph comes from the mypaseo-git daemon plugin, see the README to install or reload it.</div>}
      {!error && !log && <div className="empty">Loading…</div>}
      {!error && log && commits.length === 0 && <div className="empty">No commits</div>}
      {commits.length > 0 && (
        <>
          <div className="graph-row graph-head">
            <span>Graph</span>
            <span>Description</span>
            <span>Date</span>
            <span>Author</span>
            <span>Commit</span>
          </div>
          <div className="graph-body" ref={body}>
            {lines}
            {commits.map((c, i) => (
              <div
                key={c.sha}
                className={`graph-row ${matched.has(i) ? 'match' : ''} ${i === current ? 'current' : ''} ${c.sha === selected ? 'selected' : ''}`}
                style={{ '--c': color(rows[i].lane) } as CSSProperties}
                {...clickable(() => onSelect(c.sha))}
              >
                <span />
                <span className="graph-desc">
                  {c.refs.map((r) => (
                    <Ref key={r} name={r} />
                  ))}
                  <span className="truncate" title={c.subject}>
                    {c.subject}
                  </span>
                </span>
                <span className="truncate muted">{dateFormat.format(new Date(c.date))}</span>
                <span className="truncate muted" title={c.author}>
                  {c.author}
                </span>
                <span className="mono muted" title={c.sha}>
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
  const [details, setDetails] = useState<CommitInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    daemon.invokePluginRpc('mypaseo-git', 'show', { cwd, sha }).then(
      (r) => live && setDetails(r as CommitInfo),
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
        <div>{dateFormat.format(new Date(details.date))}</div>
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
