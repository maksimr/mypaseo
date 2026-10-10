import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { selectionRef } from '../selection'

/** Gutter button beside the last selected line of a file or diff; adds the selection to the chat. */
export function SelectionAction({ title, onAdd }: { title: string; onAdd: (ref: string) => void }) {
  const [at, setAt] = useState<{ ref: string; top: number; left: number } | null>(null)
  useEffect(() => {
    const update = () => {
      const s = selectionRef()
      const r = s?.line.getBoundingClientRect()
      setAt(s && r ? { ref: s.ref, top: r.top + r.height / 2, left: r.left } : null)
    }
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true) // capture: the file and diff views scroll, not the window
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])
  if (!at) return null
  return (
    <button
      className="selection-action"
      style={{ top: at.top, left: at.left }}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      onClick={() => onAdd(at.ref)}
    >
      <MessageSquarePlus size={13} />
    </button>
  )
}
