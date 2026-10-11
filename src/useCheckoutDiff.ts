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

export function totals(files: DiffFile[]) {
  return files.reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 })
}
