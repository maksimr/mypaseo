import { useEffect } from 'react'
import type { Agent } from './daemon'

const needsAttention = (a: Agent) => a.pendingPermissions.length > 0 || a.requiresAttention

/** "(unread) name · mypaseo"; unread counts agents that finished, failed or wait on a permission. */
export function tabTitle(name: string | undefined, agents: Agent[]) {
  const n = agents.filter(needsAttention).length
  return `${n ? `(${n}) ` : ''}${name ? `${name} · ` : ''}mypaseo`
}

/** Favicon dot color, in the sidebar status mark's order: running (amber), then needs attention (green). */
export const tabBadge = (agents: Agent[]) =>
  agents.some((a) => a.status === 'running') ? '#f59e0b' : agents.some(needsAttention) ? '#22c55e' : null

/** Shows the view and the agents' progress / unread state in the browser tab. */
export function useTabStatus(name: string | undefined, agents: Agent[]) {
  const title = tabTitle(name, agents)
  const badge = tabBadge(agents)
  const unread = agents.some(needsAttention)
  useEffect(() => {
    document.title = title
  }, [title])
  // Dot on the installed app's Dock/taskbar icon; rejects without notification permission (Safari) or outside an app.
  useEffect(() => {
    if ('setAppBadge' in navigator) void (unread ? navigator.setAppBadge() : navigator.clearAppBadge()).catch(() => {})
  }, [unread])
  useEffect(() => {
    if (!badge) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!
    const plain = link.href
    const icon = new Image()
    icon.src = plain
    let live = true
    icon.decode().then(
      () => {
        if (!live) return
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 64
        const g = canvas.getContext('2d')!
        g.drawImage(icon, 0, 0, 64, 64)
        g.arc(48, 48, 14, 0, 2 * Math.PI)
        g.fillStyle = badge
        g.fill()
        g.lineWidth = 5
        g.strokeStyle = '#23252b' // --bg ring keeps the dot apart from the blue icon
        g.stroke()
        link.href = canvas.toDataURL()
      },
      () => {}, // no icon, no badge
    )
    return () => {
      live = false
      link.href = plain
    }
  }, [badge])
}
