import { Brain, Loader2, ShieldQuestion, Sparkles, X } from 'lucide-react'
import { Pick } from '../../components/Pick'
import { ProviderIcon } from '../../components/ProviderIcon'
import { errorText, type Agent } from '../../daemon'
import { modelOptions } from '../../modelOptions'
import { archiveAgent, useDaemon, useHost } from '../../store'

/** A room's members in its chat's Context card (chat/ContextCard.tsx), the lead first: what each is doing, its Model and
 *  Thinking, and Remove (not the lead's: closing the lead closes the room). Its lines sit in the card's grid. */
export function MemberList({ members }: { members: { agent: Agent; handle: string }[] }) {
  const daemon = useDaemon()
  const { providers } = useHost()
  const report = (call: Promise<unknown>) => call.catch((e) => alert(errorText(e)))
  return (
    <>
      <div className="members-head">Members</div>
      {members.map(({ agent: a, handle }, i) => {
        const models = (providers.find((p) => p.provider === a.provider)?.models ?? []).filter((m) => m.isSelectable !== false)
        const model = a.runtimeInfo?.model ?? a.model ?? undefined
        const levels = models.find((m) => m.id === model)?.thinkingOptions ?? []
        return (
          <div key={a.id} className="member-line" role="group" aria-label={`@${handle}`}>
            <ProviderIcon provider={a.provider} size={13} />
            <span className="member-name">
              <span className="member-handle truncate">@{handle}</span>
              {/* As the sidebar's StatusMark. */}
              {a.pendingPermissions.length > 0 ? (
                <ShieldQuestion size={13} color="var(--yellow)" aria-label="Needs your action" />
              ) : a.status === 'running' ? (
                <Loader2 size={13} className="spin muted" aria-label="Running" />
              ) : a.status === 'error' ? (
                <span className="dot failed" title={a.lastError ?? 'Error'} />
              ) : null}
            </span>
            {models.length > 0 && (
              <Pick icon={<Sparkles size={14} />} value={model} onChange={(v) => report(daemon.setAgentModel(a.id, v))} options={modelOptions(models)} title="Model" />
            )}
            {levels.length > 0 && (
              <Pick
                icon={<Brain size={14} />}
                value={a.thinkingOptionId ?? a.effectiveThinkingOptionId ?? undefined}
                onChange={(v) => report(daemon.setAgentThinkingOption(a.id, v))}
                options={levels.map((o) => [o.id, o.label])}
                title="Thinking"
              />
            )}
            {i > 0 && (
              <button
                className="icon-btn"
                title="Remove"
                aria-label={`Remove @${handle}`}
                onClick={() => confirm(`Remove @${handle} from the room? Its agent is archived.`) && void archiveAgent(a)}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
