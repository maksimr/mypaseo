/** Lowercase; every run of characters outside [a-z0-9] becomes `-`; no `-` at either end. */
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** `agent` is the default agent, `user` the human; no profile may take them. */
export const RESERVED: readonly string[] = ['agent', 'user']

/** base, or the first free `base-2`, `base-3`, … */
export function uniqueHandle(base: string, taken: readonly string[]) {
  let handle = base
  for (let n = 2; taken.includes(handle); n++) handle = `${base}-${n}`
  return handle
}
