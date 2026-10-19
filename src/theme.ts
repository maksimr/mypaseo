import { useSyncExternalStore } from 'react'

// The <meta name="color-scheme"> holds the theme: 'light dark' follows the system. index.html applies the stored one before
// the first paint, base.css maps it onto color-scheme, and color-scheme picks every light-dark() color.
export type Theme = 'light dark' | 'light' | 'dark'

const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!
const system = matchMedia('(prefers-color-scheme: dark)')
const theme = () => meta.content as Theme
const dark = () => theme() === 'dark' || (theme() === 'light dark' && system.matches)

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(meta, { attributes: true })
  system.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    system.removeEventListener('change', onChange)
  }
}

export function setTheme(t: Theme) {
  if (t === 'light dark') delete localStorage.mypaseoTheme
  else localStorage.mypaseoTheme = t
  meta.content = t
}

export const useTheme = () => useSyncExternalStore(subscribe, theme)

/** Whether the dark colors show, for colors CSS doesn't reach (xterm's ANSI palette). */
export const useDark = () => useSyncExternalStore(subscribe, dark)

/** Takes a theme picked in another tab, and tints the browser's title bar with the app's background. */
export function watchTheme() {
  addEventListener('storage', (e) => {
    if (e.key === 'mypaseoTheme') meta.content = e.newValue ?? 'light dark'
  })
  const bar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
  const tint = () => (bar.content = getComputedStyle(document.documentElement).backgroundColor)
  subscribe(tint)
  tint()
}
