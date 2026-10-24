import { Brain, Loader2, ShieldQuestion, Sparkles, Users, X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Pick } from '../../components/Pick'
import { ProviderIcon } from '../../components/ProviderIcon'
import { errorText, type Agent } from '../../daemon'
import { modelOptions } from '../../modelOptions'
import { archiveAgent, useDaemon, useHost } from '../../store'

// Whether rooms show their Members card: one setting for every room, kept across reloads.
const listeners = new Set<() => void>()
let shown = localStorage.mypaseoMembers !== 'hidden'
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const useShown = () => useSyncExternalStore(subscribe, () => shown)

/** The tab bar's Show Members, for a room's chat. */
export function MembersToggle() {
  const on = useShown()
  return (
    <button
      className={`icon-btn ${on ? 'on' : ''}`}
      title="Show Members"
      aria-pressed={on}
      onClick={() => {
        shown = !on
        localStorage.mypaseoMembers = shown ? 'shown' : 'hidden'
        listeners.forEach((l) => l())
      }}
    >
      <Users size={15} />
    </button>
  )
}

/** A room's members, floating over its chat, the lead first: what each is doing, its Model and Thinking, and Remove
 *  (not the lead's: closing the lead closes the room). */
export function MemberCard({ members }: { members: { agent: Agent; handle: string }[] }) {
  const daemon = useDaemon()
  const { providers } = useHost()
  const on = useShown()
  if (!on) return null
  const report = (call: Promise<unknown>) => call.catch((e) => alert(errorText(e)))
  return (
    <div className="member-card" role="toolbar" aria-label="Members">
      <div className="member-card-head">Members</div>
      {members.map(({ agent: a, handle }, i) => {
        const models = (providers.find((p) => p.provider === a.provider)?.models ?? []).filter((m) => m.isSelectable !== false)
        const model = a.runtimeInfo?.model ?? a.model ?? undefined
        const levels = models.find((m) => m.id === model)?.thinkingOptions ?? []
        return (
          <div key={a.id} role="group" aria-label={`@${handle}`}>
            <div className="member-line">
              <ProviderIcon provider={a.provider} size={13} />
              <span className="member-handle truncate grow">@{handle}</span>
              {/* As the sidebar's StatusMark. */}
              {a.pendingPermissions.length > 0 ? (
                <ShieldQuestion size={13} color="var(--yellow)" aria-label="Needs your action" />
              ) : a.status === 'running' ? (
                <Loader2 size={13} className="spin muted" aria-label="Running" />
              ) : a.status === 'error' ? (
                <span className="dot failed" title={a.lastError ?? 'Error'} />
              ) : null}
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
            <div className="member-picks">
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
            </div>
          </div>
        )
      })}
    </div>
  )
}
