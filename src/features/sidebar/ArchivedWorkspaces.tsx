import { ArchiveRestore, GitBranch, Trash2 } from 'lucide-react'
import { Loading, Spinner } from '../../components/Spinner'
import { useEffect, useState } from 'react'
import { errorText } from '../../daemon'
import { useDaemon } from '../../store'
import { archivedWorkspaces, type HistoryEntry } from './archived'

/** A project's archived workspaces, below its active ones. Restore brings one back with the agents archived with it; Remove deletes its agents. */
export function ArchivedWorkspaces({ hostId, projectId, activeIds }: { hostId: string; projectId: string; activeIds: string[] }) {
  const daemon = useDaemon(hostId)
  const [entries, setEntries] = useState<HistoryEntry[]>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<Record<string, 'restore' | 'remove' | undefined>>({})
  // Refetches when a workspace of the project is archived or restored.
  const activeKey = activeIds.join()
  useEffect(() => {
    let current = true
    daemon
      .fetchAgentHistory({
        filter: { projectKeys: [projectId], includeArchived: true },
        sort: [{ key: 'updated_at', direction: 'desc' }],
        page: { limit: 200 },
      })
      .then(
        (r) => {
          if (current) setEntries(r.entries)
        },
        (e) => {
          if (current) setError(errorText(e))
        },
      )
    return () => {
      current = false
    }
  }, [daemon, projectId, activeKey])

  const act = async (id: string, op: 'restore' | 'remove', action: () => Promise<unknown>) => {
    setBusy((b) => ({ ...b, [id]: op }))
    try {
      await action()
    } catch (e) {
      alert(`Could not ${op} workspace: ${errorText(e)}`)
    }
    setBusy((b) => ({ ...b, [id]: undefined }))
  }
  const restore = (id: string, restoreIds: string[]) =>
    act(id, 'restore', async () => {
      await daemon.restoreWorkspace(id)
      // The daemon keeps a restored workspace's agents archived; refreshing one unarchives and reloads it, as Paseo's Unarchive does.
      await Promise.all(restoreIds.map((a) => daemon.refreshAgent(a)))
    })
  // The daemon has no workspace delete; without agents the workspace isn't found any more.
  const remove = (id: string, name: string, agentIds: string[]) => {
    if (!confirm(`Remove workspace "${name}"? Its agents are deleted for good.`)) return
    void act(id, 'remove', async () => {
      await Promise.all(agentIds.map((a) => daemon.deleteAgent(a)))
      setEntries((es) => es?.filter((e) => e.agent.workspaceId !== id))
    })
  }

  const list = entries && archivedWorkspaces(entries, activeIds)
  if (error || !list?.length)
    return (
      <div className="row workspace archived">
        {error || list ? (
          <>
            <span className="chevron" />
            <span className="truncate">{error ?? 'No archived workspaces'}</span>
          </>
        ) : (
          <Loading size={14} />
        )}
      </div>
    )
  return list.map((w) => {
    const branch = w.branch !== w.name ? w.branch : null
    return (
      <div key={w.id} className="row workspace archived">
        <span className="chevron" />
        <span className="workspace-label">
          <span className="truncate">{w.name}</span>
          {branch && (
            <span className="workspace-branch">
              <GitBranch size={11} className="status-mark" aria-label="Branch" />
              <span className="truncate">{branch}</span>
            </span>
          )}
        </span>
        {busy[w.id] ? (
          <Spinner size={13} className="status-mark" aria-label={busy[w.id] === 'restore' ? 'Restoring…' : 'Removing…'} />
        ) : (
          <>
            <button className="icon-btn hover-only" title="Restore" onClick={() => void restore(w.id, w.restoreIds)}>
              <ArchiveRestore size={11} strokeWidth={1.75} />
            </button>
            <button className="icon-btn hover-only" title="Remove" onClick={() => remove(w.id, w.name, w.agentIds)}>
              <Trash2 size={11} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
    )
  })
}
