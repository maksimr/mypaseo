import { Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '../../a11y'

export type PastedImage = { data: string; mimeType: string }

const COLORS = [
  ['#ff453a', 'Red'],
  ['#ffd60a', 'Yellow'],
  ['#32d74b', 'Green'],
  ['#0a84ff', 'Blue'],
  ['#ffffff', 'White'],
  ['#000000', 'Black'],
] as const
// On screen; in image pixels it grows with how far the image is scaled down to fit.
const PEN_PX = 4

type Stroke = { color: string; width: number; points: [number, number][] }

const draw = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  ctx.strokeStyle = ctx.fillStyle = s.color
  ctx.lineWidth = s.width
  ctx.lineCap = ctx.lineJoin = 'round'
  ctx.beginPath()
  if (s.points.length === 1) {
    ctx.arc(...s.points[0], s.width / 2, 0, 2 * Math.PI)
    return ctx.fill()
  }
  s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
}

/** Freehand drawing over a pasted image; Save hands back the image with the drawing burnt in. */
export function ImageEditor({ image, n, onSave, onClose }: { image: PastedImage; n: number; onSave: (img: PastedImage) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [base, setBase] = useState<HTMLImageElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState<string>(COLORS[0][0])
  const current = useRef<Stroke | null>(null)
  useEscape(onClose)
  const undo = () => setStrokes((prev) => prev.slice(0, -1))

  useEffect(() => {
    const img = new Image()
    img.onload = () => setBase(img)
    img.src = `data:${image.mimeType};base64,${image.data}`
  }, [image])
  // Whole redraw on load and undo; a stroke in progress draws segment by segment.
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !base) return
    ctx.drawImage(base, 0, 0)
    strokes.forEach((s) => draw(ctx, s))
  }, [base, strokes])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    const scale = e.currentTarget.width / r.width
    return [(e.clientX - r.left) * scale, (e.clientY - r.top) * scale]
  }
  const endStroke = () => {
    const s = current.current
    current.current = null
    if (s) setStrokes((prev) => [...prev, s])
  }
  const save = () => {
    if (!strokes.length) return onClose()
    // A type the browser can't encode (GIF, WebP in Safari) comes back as PNG, so read the type from the result.
    const [, mimeType, data] = /^data:(.+?);base64,(.*)$/.exec(canvas.current!.toDataURL(image.mimeType, 0.92))!
    onSave({ mimeType, data })
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog image-editor" role="dialog" aria-label={`Draw on Image ${n}`}>
        <header className="dialog-head">
          <h2 className="grow">Draw on Image {n}</h2>
          <div className="image-editor-colors" role="group" aria-label="Pen color">
            {COLORS.map(([c, name]) => (
              <button key={c} className="swatch" style={{ background: c }} title={name} aria-label={name} aria-pressed={c === color} onClick={() => setColor(c)} />
            ))}
          </div>
          <button className="icon-btn" title="Undo" disabled={!strokes.length} onClick={undo}>
            <Undo2 size={16} />
          </button>
          <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {base && (
          <canvas
            ref={canvas}
            width={base.naturalWidth}
            height={base.naturalHeight}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              const s = { color, width: (PEN_PX * el.width) / el.getBoundingClientRect().width, points: [point(e)] }
              current.current = s
              draw(el.getContext('2d')!, s)
            }}
            onPointerMove={(e) => {
              const s = current.current
              if (!s) return
              const p = point(e)
              draw(e.currentTarget.getContext('2d')!, { ...s, points: [s.points[s.points.length - 1], p] })
              s.points.push(p)
            }}
            onPointerUp={endStroke}
            onLostPointerCapture={endStroke}
          />
        )}
        <footer className="dialog-actions">
          <button className="text-btn muted" onClick={onClose}>
            <kbd>Esc</kbd> Cancel
          </button>
          <button className="btn primary" autoFocus onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
