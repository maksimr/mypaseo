// The pure part of the mypaseo-rooms plugin: mentions, room posts, digests, delivery text, batching and the loop guard.
// index.server.ts does the I/O. The rules are the Contract in doc/multi-agent-chat.md.

/** Agent-triggered deliveries per user post before the room pauses. */
export const HOP_LIMIT = 6
const DIGEST_POSTS = 20
const DIGEST_CHARS = 2000

/** A room post: a public user post, or a member's final reply in a turn opened by a public delivery. */
export type Post = { id: string; author: string /* handle, or 'user' */; to: string[]; text: string; at: string }
/** A post on its way to a member. */
export type Message = Post & { dm: boolean; images?: { data: string; mimeType: string }[]; attachments?: unknown[] }

// jscpd:ignore-start
// Twin of src/features/rooms/mentions.ts (src/ and the plugin can't import each other): keep both passing the
// Contract's table and mentions.test.ts.

/** Blanks fenced code blocks, then inline code spans, so mentions inside code don't count. */
function stripCode(text: string) {
  let fence = ''
  const prose = text
    .split('\n')
    .map((line) => {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (open?.[0] === fence[0] && open.length >= fence.length) fence = ''
        return ''
      }
      if (!open) return line
      fence = open
      return ''
    })
    .join('\n')
  return prose.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, ' ')
}

/**
 * The known handles mentioned in text, unique, in first-seen order. `@` must not follow a letter, digit, `_`, `.`,
 * `/`, `-` or `@` (mail addresses, scoped packages), and the whole `[a-z0-9-]` run after it must be the handle.
 */
export function mentions(text: string, handles: readonly string[]): string[] {
  const found = new Set<string>()
  for (const [, run] of stripCode(text).matchAll(/(?<![\p{L}\p{N}_./@-])@([A-Za-z0-9-]+)/gu)) {
    const handle = run.toLowerCase()
    if (handles.includes(handle)) found.add(handle)
  }
  return [...found]
}
// jscpd:ignore-end

/** A delivery's last line; the view reads it to hide deliveries and find private turns. */
export const marker = (id: string, dm: boolean, at: string) => `⟦${dm ? 'mpr-dm' : 'mpr'}:${id} ${at}⟧`

/**
 * The text of the member's room post in a timeline that just ended a turn (agent.turn_ended gives the whole
 * timeline): the last assistant_message after the last user_message, if that one is a public delivery. A turn opened
 * by a DM delivery or by a message typed in the member's own chat isn't a post.
 */
export function replyText(timeline: readonly { type: string; text?: string }[]) {
  const start = timeline.findLastIndex((item) => item.type === 'user_message')
  if (start < 0 || !/⟦mpr:\S+ \S+⟧\s*$/.test(timeline[start].text ?? '')) return null
  return timeline.slice(start).findLast((item) => item.type === 'assistant_message')?.text || null
}

/** The next delivery to a member: a DM alone, else every queued public message as one turn. */
export const nextBatch = (queue: readonly Message[]) => (queue[0]?.dm ? [queue[0]] : queue.filter((m) => !m.dm))

/** Counts an agent-triggered delivery; false once HOP_LIMIT went through since the last user post or Continue. */
export function admit(guard: { hops: number }) {
  if (guard.hops >= HOP_LIMIT) return false
  guard.hops++
  return true
}

const time = (iso: string) => Date.parse(iso)
const byTime = (a: Post, b: Post) => time(a.at) - time(b.at)

/** Room posts the member hasn't seen: after it joined and its last delivery, not its own, not the ones being delivered. */
export function digest(posts: readonly Post[], member: { handle: string; joined: string; delivered?: string }, delivering: readonly Message[]) {
  const since = Math.max(time(member.joined), time(member.delivered ?? member.joined))
  return posts
    .filter((p) => time(p.at) > since && p.author !== member.handle && !delivering.some((m) => m.id === p.id))
    .sort(byTime)
    .slice(-DIGEST_POSTS)
    // The replace keeps a cut emoji from leaving half a surrogate pair.
    .map((p) => (p.text.length > DIGEST_CHARS ? { ...p, text: `${p.text.slice(0, DIGEST_CHARS).replace(/[\uD800-\uDBFF]$/, '')}… (truncated)` } : p))
}

/** The room posts shared with a joining member: from `from` (or the start) to `to`, inclusive. */
export const sharedPosts = (posts: readonly Post[], from: string | undefined, to: string) =>
  posts.filter((p) => (!from || time(p.at) >= time(from)) && time(p.at) <= time(to)).sort(byTime)

const who = (handle: string) => (handle === 'user' ? 'user' : `@${handle}`)

/** `user → everyone`, `@agent → @code-reviewer`, `user → you (direct)`; an agent's post without mentions is to the user. */
function block(m: Post & { dm?: boolean }, me: string) {
  const to = m.to.length ? m.to.map((h) => (m.dm && h === me ? 'you' : who(h))).join(', ') : m.author === 'user' ? 'everyone' : 'user'
  return `${who(m.author)} → ${to}${m.dm ? ' (direct)' : ''}:\n${m.text}`
}

export const history = (posts: readonly Post[]) => posts.map((p) => block(p, '')).join('\n\n')

/** A delivery: room line, role (first delivery only), digest, the new messages, the marker. */
export function deliveryText(d: {
  handle: string
  others: readonly { handle: string; model: string }[]
  notes?: string
  digest: readonly Post[]
  messages: readonly Message[]
  marker: string
}) {
  const others = d.others.map((o) => ` @${o.handle} (${o.model})`).join(',')
  const rules = d.messages[0]?.dm
    ? 'This is a direct message: your reply goes to the user only and hands nothing off.'
    : 'To hand off to an agent, mention its @handle; a message without a mention goes to the user only. Your final message is posted to the room.'
  return [
    `[Group chat] You are @${d.handle}, talking with the user${others && ` and the agents${others}`}. ${rules}`,
    d.notes && `Your role: ${d.notes}`,
    d.digest.length && `Since your last turn:\n\n${history(d.digest)}`,
    d.messages.map((m) => block(m, d.handle)).join('\n\n'),
    d.marker,
  ]
    .filter(Boolean)
    .join('\n\n')
}

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5)

/** The `context` of a room.join item. */
export function contextSummary(c: { kind: 'none' } | { kind: 'all' } | { kind: 'range'; from: string; to?: string } | { kind: 'attachment'; attachment: { title?: string } }) {
  if (c.kind === 'none') return 'no context'
  if (c.kind === 'all') return 'whole room'
  if (c.kind === 'range') return c.to ? `${hhmm(c.from)}–${hhmm(c.to)}` : `from ${hhmm(c.from)}`
  return c.attachment.title ?? 'attached context'
}
