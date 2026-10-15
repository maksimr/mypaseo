import { ShieldQuestion } from 'lucide-react'
import { useState } from 'react'
import { errorText, type Permission } from '../../daemon'
import { useDaemon } from '../../store'
import { ToolDetailView } from './Timeline'

export function PermissionCard({ agentId, request: r }: { agentId: string; request: Permission }) {
  const daemon = useDaemon()
  const [busy, setBusy] = useState(false)
  const actions: NonNullable<Permission['actions']> = r.actions?.length
    ? r.actions
    : [
        { id: 'deny', label: 'Deny', behavior: 'deny' },
        { id: 'allow', label: 'Allow', behavior: 'allow', variant: 'primary' },
      ]
  const respond = async (a: (typeof actions)[number]) => {
    setBusy(true)
    try {
      await daemon.respondToPermission(agentId, r.id, {
        behavior: a.behavior,
        ...(r.actions?.length ? { selectedActionId: a.id } : {}),
      })
    } catch (e) {
      alert(errorText(e))
      setBusy(false)
    }
  }
  return (
    <div className="permission">
      <div className="permission-title">
        <ShieldQuestion size={15} />
        <span className="grow">{r.title ?? r.name}</span>
      </div>
      {r.description && <div className="muted pre-wrap">{r.description}</div>}
      {r.detail ? (
        <ToolDetailView detail={r.detail} />
      ) : r.input && Object.keys(r.input).length > 0 ? (
        <pre className="term">{JSON.stringify(r.input, null, 2)}</pre>
      ) : null}
      <div className="permission-actions">
        {actions.map((a) => (
          <button
            key={a.id}
            className={`btn ${a.variant === 'primary' ? 'primary' : a.variant === 'danger' ? 'danger' : ''}`}
            disabled={busy}
            onClick={() => void respond(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
