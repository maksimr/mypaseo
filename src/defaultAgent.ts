import { useSyncExternalStore } from 'react'

/** The default agent, `@agent` (doc/multi-agent-chat.md): the provider, model and thinking a new agent starts with, and
 *  the color and icon of one started from no profile, as a profile's (`rooms/colors.ts`, `rooms/blob.ts`). Set in
 *  Settings → Profiles and stored in this browser; until then a new agent starts with the composer's last picks. */
export type DefaultAgent = { provider?: string; model?: string; thinking?: string; color?: string; icon?: string }

const listeners = new Set<() => void>()
let saved: DefaultAgent | undefined = localStorage.mypaseoDefaultAgent && JSON.parse(localStorage.mypaseoDefaultAgent)

export const savedDefaultAgent = () => saved

export function saveDefaultAgent(d: DefaultAgent) {
  saved = d
  localStorage.mypaseoDefaultAgent = JSON.stringify(d)
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useDefaultAgent = () => useSyncExternalStore(subscribe, savedDefaultAgent)
