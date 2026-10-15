// Fails when two modules in one folder differ only in case (review.ts, Review.tsx): `./Review` then resolves to
// either file depending on the file system, review.ts on macOS.
import { readdirSync } from 'node:fs'

const seen = new Map()
let failed = false
for (const dir of ['src', 'paseo-plugin'])
  for (const file of readdirSync(dir, { recursive: true })) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    const key = `${dir}/${file}`.replace(/\.[cm]?[jt]sx?$/, '').toLowerCase()
    if (seen.has(key)) {
      console.error(`${seen.get(key)} and ${dir}/${file} differ only in case: rename one`)
      failed = true
    } else seen.set(key, `${dir}/${file}`)
  }
process.exit(failed ? 1 : 0)
