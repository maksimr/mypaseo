import { useSyncExternalStore } from 'react'

// <meta name="color-scheme"> holds the theme: 'light dark' follows the system. index.html applies the one picked in
// Settings before the first paint; styles/theme.css maps it onto color-scheme, which picks each light-dark() color.
export type Theme = 'system' | 'light' | 'dark'

const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!
const system = matchMedia('(prefers-color-scheme: dark)')
const picked = () => (meta.content === 'light dark' ? 'system' : meta.content) as Theme
const dark = () => picked() === 'dark' || (picked() === 'system' && system.matches)

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
  if (t === 'system') delete localStorage.mypaseoTheme
  else localStorage.mypaseoTheme = t
  meta.content = t === 'system' ? 'light dark' : t
}

/** The theme picked in Settings. */
export const useTheme = () => useSyncExternalStore(subscribe, picked)

/** Whether the dark colors show: TS that reads colors (cssColor) reads them again when this changes. */
export const useDark = () => useSyncExternalStore(subscribe, dark)

// light-dark() resolves only inside a color property, so variables are read through one, on an element that never renders.
const probe = document.head.appendChild(document.createElement('meta'))

/** A color variable of styles/theme.css as shown now, e.g. cssColor('bg'). */
export function cssColor(name: string) {
  probe.style.color = `var(--${name})`
  return getComputedStyle(probe).color
}

/** Takes a theme picked in another tab, and tints the browser's title bar with --bg. */
export function watchTheme() {
  addEventListener('storage', (e) => {
    if (e.key === 'mypaseoTheme') meta.content = e.newValue ?? 'light dark'
  })
  const bar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
  const tint = () => (bar.content = cssColor('bg'))
  subscribe(tint)
  tint()
}
