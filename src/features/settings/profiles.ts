// The handle rules of doc/multi-agent-chat.md (Contract), for the Profiles section.
import { RESERVED, slug } from '../rooms/handles.ts'

/** Why a profile named name can't get its handle, or null. id: the profile being edited, which keeps its own handle. */
export function handleError(name: string, id: string, profiles: { id: string; name: string }[]) {
  const handle = slug(name)
  if (!handle) return 'The name needs a letter or digit.'
  if (RESERVED.includes(handle)) return `@${handle} is reserved.`
  if (profiles.some((p) => p.id !== id && slug(p.name) === handle)) return `Another profile is already @${handle}.`
  return null
}
