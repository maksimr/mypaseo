import { Dices, Spline } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { BLOB, blobOf, EYES, iconOf, points, RADIUS, randomBlob, SHAPES, type BlobIcon } from '../rooms/blob'
import { ProfileIcon } from '../rooms/ProfileIcon'

const title = (s: string) => s[0].toUpperCase() + s.slice(1)
/** How far an arrow key moves a focused point out (up, right) or in; Shift moves it 5 times as far. */
const STEPS: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }

/** A profile's icon fields: no icon, a preset or a custom blob; its eyes; a custom blob's outline. `color`: a CSS color. */
export function IconPicker({ icon, color, onChange }: { icon?: string; color?: string; onChange: (icon?: string) => void }) {
  const iconLabel = useId()
  const eyesLabel = useId()
  const blob = blobOf(icon)
  const eyes = blob?.eyes ?? 'tall'
  const radii = blob && typeof blob.body !== 'string' ? blob.body : undefined
  const draw = (b: BlobIcon) => <ProfileIcon icon={iconOf(b)} color={color} size={24} />
  return (
    <>
      <div className="field">
        <div id={iconLabel} className="field-label">
          Icon
        </div>
        <div className="profile-icon-row">
          <div className="profile-icons" role="radiogroup" aria-labelledby={iconLabel}>
            <Cell name="profileIcon" label="No Icon" checked={!blob} onChange={() => onChange(undefined)}>
              <span className="no-icon" />
            </Cell>
            {SHAPES.map((s) => (
              <Cell key={s} name="profileIcon" label={title(s)} checked={blob?.body === s} onChange={() => onChange(iconOf({ body: s, eyes }))}>
                {draw({ body: s, eyes })}
              </Cell>
            ))}
            <Cell name="profileIcon" label="Custom" checked={!!radii} onChange={() => onChange(iconOf({ body: BLOB, eyes }))}>
              {radii ? draw({ body: radii, eyes }) : <Spline size={18} />}
            </Cell>
          </div>
          {/* A custom blob to start from: its outline and eyes stay editable. */}
          <button type="button" className="icon-btn" title="Random Blob" aria-label="Random Blob" onClick={() => onChange(iconOf(randomBlob()))}>
            <Dices size={18} />
          </button>
        </div>
      </div>
      {blob && (
        <div className="field">
          <div id={eyesLabel} className="field-label">
            Eyes
          </div>
          <div className="profile-icons" role="radiogroup" aria-labelledby={eyesLabel}>
            {EYES.map((e) => (
              <Cell key={e} name="profileEyes" label={title(e)} checked={eyes === e} onChange={() => onChange(iconOf({ ...blob, eyes: e }))}>
                {draw({ ...blob, eyes: e })}
              </Cell>
            ))}
          </div>
        </div>
      )}
      {radii && <Outline radii={radii} icon={icon} color={color} onChange={(r) => onChange(iconOf({ body: r, eyes }))} />}
    </>
  )
}

/** A radio drawn as its icon, `children`. */
function Cell({ name, label, checked, onChange, children }: { name: string; label: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label title={label}>
      <input type="radio" name={name} aria-label={label} checked={checked} onChange={onChange} />
      {children}
    </label>
  )
}

/** A custom blob drawn large, a handle on each point of its outline that moves along its spoke: dragged, or by the arrow
 *  keys once focused. */
function Outline({ radii, icon, color, onChange }: { radii: number[]; icon?: string; color?: string; onChange: (radii: number[]) => void }) {
  const label = useId()
  const hint = useId()
  const svg = useRef<SVGSVGElement>(null)
  const set = (i: number, r: number) => onChange(radii.with(i, Math.min(RADIUS.max, Math.max(RADIUS.min, Math.round(r)))))
  return (
    <div className="field">
      <div id={label} className="field-label">
        Outline
      </div>
      <div className="blob-outline" role="group" aria-labelledby={label} aria-describedby={hint}>
        <ProfileIcon icon={icon} color={color} />
        <svg ref={svg} viewBox="0 0 100 100">
          {points(radii).map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              role="slider"
              tabIndex={0}
              aria-label={`Point ${i + 1}`}
              aria-valuemin={RADIUS.min}
              aria-valuemax={RADIUS.max}
              aria-valuenow={radii[i]}
              onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId) || !svg.current) return
                // The pointer's distance from the middle along the point's spoke, on the 100×100 grid.
                const box = svg.current.getBoundingClientRect()
                const px = ((e.clientX - box.left) / box.width) * 100 - 50
                const py = ((e.clientY - box.top) / box.height) * 100 - 50
                set(i, (px * (x - 50) + py * (y - 50)) / radii[i])
              }}
              onKeyDown={(e) => {
                const step = STEPS[e.key]
                if (!step) return
                e.preventDefault()
                set(i, radii[i] + step * (e.shiftKey ? 5 : 1))
              }}
            />
          ))}
        </svg>
      </div>
      <div id={hint} className="field-hint muted">
        Drag a point, or focus it and press the arrow keys.
      </div>
    </div>
  )
}
