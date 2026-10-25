import { ChevronRight, Loader2, ShieldQuestion } from 'lucide-react'
import type { Agent } from '../../daemon'

/** A room member: its handle and its profile's color (a CSS color), if it has one. */
export type Member = { agent: Agent; handle: string; color?: string }

/** A member's color on a tile. */
export const MemberAvatar = ({ color }: { color?: string }) => (
  <span className="member-avatar">
    <span className="dot" style={{ background: color }} />
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
          <Loader2 size={11} className="spin" />
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
          <MemberAvatar color={m.color} />
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
