/** A generated profile icon: a blob with eyes, in the profile's color (`ProfileIcon.tsx` draws it). The profile's `icon`
 *  holds its seed, `blob:<seed>`; Paseo desktop reads `icon` as a key of its own icon set and draws one it doesn't
 *  know as its default glyph. */
const SEED = /^blob:(\d+)$/

const SHAPES = ['circle', 'drop', 'triangle', 'cloud', 'pill', 'clover', 'squircle'] as const
const EYES = ['tall', 'short', 'dash', 'glint'] as const

export type BlobIcon = {
  shape: (typeof SHAPES)[number]
  eyes: (typeof EYES)[number]
  /** Degrees the whole blob turns. */
  tilt: number
  /** Where the eyes look: their offset from the middle of the face, on the 100×100 grid. */
  look: { x: number; y: number }
}

export const newBlob = () => `blob:${Math.floor(Math.random() * 2 ** 32)}`

/** The blob an icon draws, or undefined if it isn't one. */
export function blobOf(icon?: string): BlobIcon | undefined {
  const m = icon && SEED.exec(icon)
  if (!m) return
  // mulberry32: the same seed draws the same blob on every client.
  let s = Number(m[1]) | 0
  const next = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]
  const spread = (r: number) => Math.round((next() * 2 - 1) * r)
  return { shape: pick(SHAPES), eyes: pick(EYES), tilt: spread(14), look: { x: spread(7), y: spread(5) } }
}
