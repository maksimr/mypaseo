import type { AgentAttentionRequiredNotification } from '@getpaseo/client/internal/daemon-client'
import { useEffect, useEffectEvent } from 'react'
import { onAttention, useStore } from './store'

export const notificationsSupported = 'Notification' in window

/** Granted by the browser and not muted in Settings. */
export const notificationsOn = () =>
  notificationsSupported && Notification.permission === 'granted' && localStorage.mypaseoNotifications !== 'off'

/** OS notification when an agent finishes, fails or needs permission, unless the user is looking at that agent. */
export function useAttentionNotifications(viewedAgentId: string | undefined, onOpen: (agentId: string) => void) {
  const { agents } = useStore()
  const notify = useEffectEvent(({ agentId, notification }: AgentAttentionRequiredNotification) => {
    if (!notificationsOn()) return
    if (agentId === viewedAgentId && document.visibilityState === 'visible' && document.hasFocus()) return
    const reason = notification?.title ?? 'Agent needs attention'
    const title = agents.find((a) => a.id === agentId)?.title
    // tag: a second open tab replaces this notification instead of stacking a copy.
    const n = new Notification(title ? `${reason}: ${title}` : reason, {
      body: notification?.body,
      tag: agentId,
      icon: '/favicon.png',
    })
    n.onclick = () => {
      window.focus()
      onOpen(agentId)
      n.close()
    }
  })
  useEffect(() => onAttention((e) => notify(e)), [])
}
