type View = { height: number; pageTop: number; scale: number }

/**
 * The part of the page the on-screen keyboard leaves visible, if it covers some of the window: iOS shrinks only the
 * visual viewport (Chrome on Android resizes the layout one too, per interactive-widget in index.html, so there's none).
 * None while pinch-zoomed, which shrinks the visual viewport too.
 */
export const keyboardView = (layoutHeight: number, vv: View) =>
  Math.abs(vv.scale - 1) < 0.01 && layoutHeight - vv.height >= 1 ? { height: vv.height, top: vv.pageTop } : null

/**
 * While the on-screen keyboard is up, the app covers only what it leaves visible (--vv-h, --vv-top in styles/tablet.css),
 * so its bars stay in view and the composer sits on the keyboard; the keyboard covers the home indicator, so no
 * --safe-bottom then.
 */
export function watchViewport() {
  const vv = visualViewport
  if (!vv) return
  const root = document.documentElement.style
  const fit = () => {
    const k = keyboardView(document.documentElement.clientHeight, vv)
    if (!k) for (const p of ['--vv-h', '--vv-top', '--safe-bottom']) root.removeProperty(p)
    else {
      root.setProperty('--vv-h', `${k.height}px`)
      root.setProperty('--vv-top', `${k.top}px`)
      root.setProperty('--safe-bottom', '0px')
    }
  }
  vv.addEventListener('resize', fit)
  vv.addEventListener('scroll', fit)
}
