import { ShieldQuestion } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import type { ReactNode } from 'react'
import type { Agent } from '../../daemon'

/** Derived from agents: the daemon's workspace status can lag behind them. */
export function StatusMark({ agents, idle = null }: { agents: Agent[]; idle?: ReactNode }) {
  // An agent waiting on a permission is still 'running', so this must come before the loader.
  if (agents.some((a) => a.pendingPermissions.length > 0))
    return <ShieldQuestion size={13} color="var(--yellow)" className="status-mark" aria-label="Needs your action" />
  if (agents.some((a) => a.status === 'running'))
    return <Spinner size={13} className="status-mark" aria-label="Running" />
  if (agents.some((a) => a.requiresAttention))
    return <span className="dot attention status-mark" title="Needs attention" />
  if (agents.some((a) => a.status === 'error')) return <span className="dot failed status-mark" title="Error" />
  return idle
}
