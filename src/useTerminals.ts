import { useEffect, useState } from 'react'
import type { TerminalInfo, Workspace } from './daemon'
import { useDaemon } from './store'

/** The workspace's terminals, live: the daemon pushes the list as they start, exit or retitle. */
export function useTerminals(hostId: string, workspace: Workspace | undefined) {
  const daemon = useDaemon(hostId)
  const cwd = workspace?.workspaceDirectory
  const workspaceId = workspace?.id
  const [state, setState] = useState<{ key?: string; list: TerminalInfo[] }>({ list: [] })
  useEffect(() => {
    if (!cwd) return
    const sub = daemon.observeTerminals({ cwd, workspaceId })
    const apply = (p: { terminals: TerminalInfo[] }) => setState({ key: workspaceId, list: p.terminals })
    sub.subscribe({ snapshot: apply, update: (m) => m.type === 'terminals_changed' && apply(m.payload) })
    return () => void sub.release().catch(() => {})
  }, [daemon, cwd, workspaceId])
  const loaded = state.key === workspaceId
  const create = async () => {
    const { terminal, error } = await daemon.createTerminal(cwd!, undefined, undefined, { workspaceId })
    if (!terminal) throw new Error(error ?? 'The daemon did not create a terminal')
    // The list push can trail the response; add it now so its tab can open.
    setState((s) => (s.key !== workspaceId || s.list.some((t) => t.id === terminal.id) ? s : { ...s, list: [...s.list, terminal] }))
    return terminal
  }
  const kill = async (id: string) => {
    if (!(await daemon.killTerminal(id)).success) throw new Error('The daemon did not stop the terminal')
  }
  return { terminals: loaded ? state.list : [], loaded, create, kill }
}
