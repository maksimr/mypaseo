/** A profile icon: a blob with eyes, in the profile's color (`ProfileIcon.tsx` draws it), built in Settings → Profiles
 *  (`settings/IconPicker.tsx`). The profile's `icon` holds `blob:<body>` or `blob:<body>:<eyes>`: the body one of SHAPES
 *  or a custom outline's radii, comma-separated (`outline`); the eyes one of EYES, `tall` when left out. Paseo desktop
 *  reads `icon` as a key of its own icon set and draws one it doesn't know as its default glyph. */
const ICON = /^blob:([a-z]+|\d+(?:,\d+){2,})(?::([a-z]+))?$/

/** The presets, in the picker's order. */
export const SHAPES = ['circle', 'blob', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop'] as const
export const EYES = ['tall', 'short', 'dash', 'glint'] as const
/** A custom outline's radii: from `min` the eyes fit inside one of BLOB's seven points wherever they sit, up to `max` it
 *  fits the grid. */
export const RADIUS = { min: 28, max: 45 }
/** The `blob` preset's radii, and a custom outline's to start from. */
export const BLOB = [40, 44, 41, 38, 44, 39, 42]

export type Shape = (typeof SHAPES)[number]
export type Eyes = (typeof EYES)[number]
export type BlobIcon = { body: Shape | number[]; eyes: Eyes }

/** The blob an icon draws, or undefined if it isn't one. */
export function blobOf(icon?: string): BlobIcon | undefined {
  const m = icon ? ICON.exec(icon) : null
  const eyes = EYES.find((e) => e === (m?.[2] ?? 'tall'))
  if (!m || !eyes) return
  const shape = SHAPES.find((s) => s === m[1])
  if (shape) return { body: shape, eyes }
  const radii = m[1].split(',').map(Number)
  if (radii.every((r) => r >= RADIUS.min && r <= RADIUS.max)) return { body: radii, eyes }
}

/** A custom blob with random eyes and points, their radii 33 to 44: rounder than RADIUS allows. */
export const randomBlob = (): BlobIcon => ({
  body: BLOB.map(() => 33 + Math.floor(Math.random() * 12)),
  eyes: EYES[Math.floor(Math.random() * EYES.length)],
})

/** The icon that draws a blob, as `blobOf` reads it. */
export const iconOf = ({ body, eyes }: BlobIcon) => `blob:${typeof body === 'string' ? body : body.join(',')}${eyes === 'tall' ? '' : `:${eyes}`}`

/** The points of an outline on the 100×100 grid: one at each radius from (50, 50), evenly turned from the top. */
export const points = (radii: number[]) =>
  radii.map((r, i) => {
    const a = (2 * Math.PI * i) / radii.length - Math.PI / 2
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]
  })

/** A smooth closed path through an outline's points. */
export const outline = (radii: number[]) => spline(points(radii))

/** A smooth closed path through points: a Catmull-Rom spline as cubic Béziers. */
export function spline(p: number[][]) {
  const n = p.length
  const at = (i: number) => p[(i + n) % n]
  const xy = (x: number, y: number) => `${+x.toFixed(1)} ${+y.toFixed(1)}`
  let d = `M${xy(p[0][0], p[0][1])}`
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    d += `C${xy(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6)} ${xy(c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6)} ${xy(c[0], c[1])}`
  }
  return `${d}Z`
}
