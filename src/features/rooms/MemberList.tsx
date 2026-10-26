import { ChevronRight, ShieldQuestion } from 'lucide-react'
import { Spinner } from '../../components/Spinner'
import type { Agent } from '../../daemon'
import { ProfileIcon } from './ProfileIcon'

/** A room member: its handle and its profile's color (a CSS color) and icon, if it has them. */
export type Member = { agent: Agent; handle: string; color?: string; icon?: string }

/** A member's icon, else its color, on a tile. */
export const MemberAvatar = ({ color, icon }: { color?: string; icon?: string }) => (
  <span className="member-avatar">
    <ProfileIcon icon={icon} color={color} size={20} />
  </span>
)

/** Its handle, This Chat on the lead, and what it's doing (as the sidebar's StatusMark). */
export function MemberName({ member: { agent: a, handle }, lead }: { member: Member; lead?: boolean }) {
  return (
    <span className="member-name">
      <span className="member-handle truncate">@{handle}</span>
      {lead && <span className="member-badge">This Chat</span>}
      {a.pendingPermissions.length > 0 ? (
        <span className="member-status">
          <ShieldQuestion size={11} color="var(--yellow)" />
          Needs action
        </span>
      ) : a.status === 'running' ? (
        <span className="member-status">
          <Spinner size={11} />
          Working
        </span>
      ) : a.status === 'error' ? (
        <span className="member-status" title={a.lastError ?? undefined}>
          <span className="dot failed" />
          Error
        </span>
      ) : null}
    </span>
  )
}

/** A room's members in its chat's Context card (chat/ContextCard.tsx), the lead first: what each is doing and runs
 *  (`brief`). A click opens its settings (`onOpen`), Remove among them. */
export function MemberList({ members, onOpen }: { members: (Member & { brief: string })[]; onOpen: (agentId: string) => void }) {
  return (
    <div className="members">
      <div className="members-head">
        Members<span className="members-count">{members.length}</span>
      </div>
      {members.map((m, i) => (
        <button key={m.agent.id} className="member-chip" onClick={() => onOpen(m.agent.id)}>
          <MemberAvatar color={m.color} icon={m.icon} />
          <span className="member-identity">
            <MemberName member={m} lead={i === 0} />
            <span className="member-brief truncate">{m.brief}</span>
          </span>
          <ChevronRight size={14} className="faint" />
        </button>
      ))}
      <p className="member-hint">Select a member to configure its session.</p>
    </div>
  )
}
