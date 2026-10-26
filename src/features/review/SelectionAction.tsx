import { Check, Copy, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { errorText } from '../../daemon'
import { hoveredRef, selectionRef, type SelectedLines } from './selection'

/** Gutter buttons beside the last selected line of a file or diff, or else the hovered line; act on those lines. Copy Path copies "<cwd>/path:start-end". */
export function SelectionAction({ title, onAdd, cwd }: { title: string; onAdd: (s: SelectedLines) => void; cwd: string }) {
  const [at, setAt] = useState<{ s: SelectedLines; top: number; left: number } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    let hovered: SelectedLines | null = null
    const update = () => {
      const s = selectionRef() ?? (hovered?.line.isConnected ? hovered : null)
      if (!s) return setAt(null)
      const r = s.line.getBoundingClientRect()
      // The last selected line may be scrolled away: the button stays in the visible part, between the file's sticky header and the scroller's bottom.
      const box = s.line.closest('[data-path]')
      const head = box?.querySelector(':scope > .excerpt-head, :scope > .file-path')?.getBoundingClientRect().bottom ?? 0
      const foot = box?.closest('[tabindex="-1"]')?.getBoundingClientRect().bottom ?? innerHeight
      const half = r.height / 2
      const top = Math.min(Math.max(r.top + half, head + half), foot - half)
      // A file view's lines scroll sideways in their <pre>; the button stays at its left edge like the sticky comment thread.
      setAt({ s, top, left: Math.max(r.left, s.line.parentElement!.getBoundingClientRect().left) })
    }
    const over = (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest('.selection-action')) return // moving onto the button keeps it
      const h = hoveredRef(t)
      if (h?.line === hovered?.line) return
      hovered = h
      update()
    }
    document.addEventListener('selectionchange', update)
    document.addEventListener('mouseover', over)
    window.addEventListener('scroll', update, true) // capture: the file and diff views scroll, not the window
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('mouseover', over)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])
  if (!at) return null
  const path = `${cwd}/${at.s.ref}`
  const copy = () =>
    navigator.clipboard.writeText(path).then(
      () => {
        setCopied(path)
        setTimeout(() => setCopied(null), 1200)
      },
      (err) => alert(`Could not copy: ${errorText(err)}`),
    )
  return (
    // onMouseDown: keep the selection
    <div className="selection-action" style={{ top: at.top, left: at.left }} onMouseDown={(e) => e.preventDefault()}>
      <button title="Copy Path" aria-label="Copy Path" onClick={copy}>
        {copied === path ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button title={title} aria-label={title} onClick={() => onAdd(at.s)}>
        <MessageCircle size={13} />
      </button>
    </div>
  )
}
