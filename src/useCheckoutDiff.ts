import { useEffect, useState } from 'react'
import { errorText, type DiffFile } from './daemon'
import { useDaemon } from './store'

export type DiffState = { files: DiffFile[]; error: string | null; loading: boolean; tooLarge?: boolean }

/** Live HEAD→worktree diff of a checkout; the daemon pushes updates as files change. */
export function useCheckoutDiff(hostId: string, cwd: string | undefined): DiffState {
  const daemon = useDaemon(hostId)
  const key = cwd ?? ''
  const [state, setState] = useState<DiffState & { key: string }>({ key: '', files: [], error: null, loading: false })
  useEffect(() => {
    if (!cwd) return
    const sub = daemon.observeCheckoutDiff(cwd, { mode: 'uncommitted' })
    const apply = (p: { files: DiffFile[]; error: { message: string } | null; diffTooLarge?: boolean }) =>
      setState({ key, files: p.files, error: p.error?.message ?? null, loading: false, tooLarge: p.diffTooLarge })
    sub.subscribe({
      snapshot: apply,
      update: (m) => m.type === 'checkout_diff_update' && apply(m.payload),
      error: (e) => setState({ key, files: [], error: errorText(e), loading: false }),
    })
    return () => void sub.release().catch(() => {})
  }, [daemon, cwd, key])
  return state.key === key ? state : { files: [], error: null, loading: !!cwd }
}

/** The mypaseo-git plugin's `show` RPC, see paseo-plugin/index.server.ts. */
export type CommitInfo = {
  author: string
  email: string
  date: string
  message: string
  files: { path: string; status: string; additions: number; deletions: number }[]
}

/** A commit's diff (merges against their first parent): the plugin lists its files, the daemon diffs each one. */
export function useCommitDiff(hostId: string, cwd: string | undefined, sha: string | undefined): DiffState {
  const daemon = useDaemon(hostId)
  const key = cwd && sha ? `${cwd}@${sha}` : ''
  const [state, setState] = useState<DiffState & { key: string }>({ key: '', files: [], error: null, loading: false })
  useEffect(() => {
    if (!cwd || !sha) return
    let live = true
    const load = async () => {
      const { files } = (await daemon.invokePluginRpc('mypaseo-git', 'show', { cwd, sha })) as CommitInfo
      const out: DiffFile[] = []
      let next = 0
      // A few at a time: each file is a git show plus highlighting in the daemon.
      const worker = async () => {
        for (let i = next++; i < files.length; i = next++) {
          const f = files[i]
          // null: no text diff (binary).
          out[i] = (await daemon.getCommitFileDiff(cwd, sha, f.path)).file ?? {
            ...f,
            isNew: f.status === 'A',
            isDeleted: f.status === 'D',
            hunks: [],
            status: 'binary',
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      if (live) setState({ key, files: out, error: null, loading: false })
    }
    load().catch((e) => live && setState({ key, files: [], error: errorText(e), loading: false }))
    return () => {
      live = false
    }
  }, [daemon, cwd, sha, key])
  return state.key === key ? state : { files: [], error: null, loading: !!key }
}

export function totals(files: DiffFile[]) {
  return files.reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 })
}

/** "a/b/c.ts" → ["c.ts", "a/b"]. */
export const split = (path: string) => {
  const i = path.lastIndexOf('/')
  return [path.slice(i + 1), i > 0 ? path.slice(0, i) : ''] as const
}
