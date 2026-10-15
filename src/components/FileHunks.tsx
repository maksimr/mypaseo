import { Fragment } from 'react'
import { chunkKey, chunks, type Chunk } from '../chunks'
import type { DiffFile } from '../daemon'
import { useReview } from '../review'
import { Tokens } from './Code'
import { ReviewThread } from './Review'
import type { Filter } from './Changes'

type ChunkAction = (cs: Chunk[], i: number, flag: boolean) => void

/** A file's hunks; without onRestore they are read-only. */
export function FileHunks({
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
