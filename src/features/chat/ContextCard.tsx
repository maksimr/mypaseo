import { SquareMenu } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { Agent } from '../../daemon'
import { OpenInEditor } from '../files/OpenInEditor'
import { MemberList } from '../rooms/MemberList'

// Whether chats show their Context card: one setting for every chat, kept across reloads.
const listeners = new Set<() => void>()
let shown = localStorage.mypaseoContext !== 'hidden'
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const useShown = () => useSyncExternalStore(subscribe, () => shown)

/** The tab bar's Show Context, for a chat. `room`: it has members, all a phone shows (no Open in Editor there). */
export function ContextToggle({ room }: { room: boolean }) {
  const on = useShown()
  return (
    <button
      className={`icon-btn context-toggle ${room ? 'room' : ''} ${on ? 'on' : ''}`}
      title="Show Context"
      aria-pressed={on}
      onClick={() => {
        shown = !on
        localStorage.mypaseoContext = shown ? 'shown' : 'hidden'
        listeners.forEach((l) => l())
      }}
    >
      <SquareMenu size={15} />
    </button>
  )
}

/** A chat's context, floating over it: Open in Editor for its workspace, then a room's members. */
export function ContextCard({ cwd, members }: { cwd: string | undefined; members: { agent: Agent; handle: string }[] | undefined }) {
  const on = useShown()
  if (!on || (!cwd && !members)) return null
  return (
    <div className="context-card" role="toolbar" aria-label="Context">
      {cwd && <OpenInEditor path={cwd} />}
      {members && <MemberList members={members} />}
    </div>
  )
}
