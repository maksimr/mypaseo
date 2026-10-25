import { ChevronLeft, SquareMenu, X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useHost } from '../../store'
import { OpenInEditor } from '../files/OpenInEditor'
import { MemberList, type Member } from '../rooms/MemberList'
import { MemberSettings } from './MemberSettings'
import { agentSettings, briefOf } from './session'

// Whether chats show their Context card: one setting for every chat, kept across reloads.
const listeners = new Set<() => void>()
let shown = localStorage.mypaseoContext !== 'hidden'
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const useShown = () => useSyncExternalStore(subscribe, () => shown)
const setShown = (on: boolean) => {
  shown = on
  localStorage.mypaseoContext = on ? 'shown' : 'hidden'
  listeners.forEach((l) => l())
}

/** The tab bar's Show Context, for a chat. `room`: it has members, all a phone shows (no Open in Editor there). */
export function ContextToggle({ room }: { room: boolean }) {
  const on = useShown()
  return (
    <button className={`icon-btn context-toggle ${room ? 'room' : ''} ${on ? 'on' : ''}`} title="Show Context" aria-pressed={on} onClick={() => setShown(!on)}>
      <SquareMenu size={15} />
    </button>
  )
}

/** A chat's context, floating over it: Open in Editor for its workspace, then a room's members; a member's settings in
 *  their place once picked. */
export function ContextCard({ cwd, members }: { cwd: string | undefined; members: Member[] | undefined }) {
  const on = useShown()
  const { providers } = useHost()
  const [open, setOpen] = useState<string>()
  if (!on || (!cwd && !members)) return null
  const entry = (m: Member) => providers.find((p) => p.provider === m.agent.provider)
  const editing = members?.find((m) => m.agent.id === open)
  return (
    <div className="context-card" role="toolbar" aria-label="Context">
      <div className="context-head">
        {editing && (
          <button className="icon-btn" title="Back" aria-label="Back to Members" onClick={() => setOpen(undefined)}>
            <ChevronLeft size={15} />
          </button>
        )}
        <span className="context-title truncate">{editing ? `Configure @${editing.handle}` : 'Context'}</span>
        <button className="icon-btn" title="Hide Context" onClick={() => setShown(false)}>
          <X size={14} />
        </button>
      </div>
      {editing ? (
        <MemberSettings key={editing.agent.id} member={editing} lead={editing === members?.[0]} entry={entry(editing)} onDone={() => setOpen(undefined)} />
      ) : (
        <>
          {cwd && <OpenInEditor path={cwd} />}
          {members && (
            <MemberList
              // Its composer chip's summary: the same settings, read the same way.
              members={members.map((m) => ({ ...m, brief: briefOf(agentSettings(entry(m), m.agent, () => {})) }))}
              onOpen={setOpen}
            />
          )}
        </>
      )}
    </div>
  )
}
