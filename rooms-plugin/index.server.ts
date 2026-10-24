// Group chats for mypaseo: routes room posts between the member agents of a room by their @mentions and keeps the
// room log. Its only client is src/rooms.ts. The rules are the Contract in doc/multi-agent-chat.md; the pure part
// lives in server/route.ts (the daemon builds only modules under server/, client/ or shared/).
import { defineRpc } from '@getpaseo/plugin'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import type { PaseoApi } from '@getpaseo/client'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { admit, contextSummary, deliveryText, digest, history, marker, mentions, nextBatch, replyText, sharedPosts } from './server/route.ts'
import type { Message, Post } from './server/route.ts'

const ROOM = 'mypaseo.room'
const HANDLE = 'mypaseo.handle'
const PROFILE = 'mypaseo.profile'
// The plugin API offers no data directory.
const DIR = join(homedir(), '.paseo', 'mypaseo-rooms')

const roomId = z.string().regex(/^[\w-]+$/) // an agent id; also the room log's file name
const handle = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).refine((h) => h !== 'user', '`user` is reserved')
const textAttachment = z.object({
  type: z.literal('text'),
  mimeType: z.literal('text/plain'),
  title: z.string().optional(),
  text: z.string(),
  contextKind: z.string().optional(),
})
const context = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('range'), from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }).optional() }),
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('attachment'), attachment: textAttachment }),
])
const member = z.object({
  handle,
  profileId: z.string().optional(),
  notes: z.string().optional(),
  config: z.object({
    provider: z.string(),
    model: z.string().optional(),
    thinkingOptionId: z.string().optional(),
    modeId: z.string().optional(),
    featureValues: z.record(z.string(), z.unknown()).optional(),
    systemPrompt: z.string().optional(),
  }),
  context,
})
const done = z.object({})

/** Creates idle agents in the lead's workspace; context and notes (unless it has a systemPrompt) go with each one's first delivery. */
const joinRpc = defineRpc({
  name: 'room.join',
  input: z.object({ roomId, members: z.array(member).min(1) }),
  output: z.object({ agentIds: z.array(z.string()) }),
})
/** `to` = handles, [] = every member. A DM goes to the mentioned members only and its replies aren't routed. */
const postRpc = defineRpc({
  name: 'room.post',
  input: z
    .object({
      roomId,
      text: z.string(),
      to: z.array(handle),
      dm: z.boolean(),
      images: z.array(z.object({ data: z.string(), mimeType: z.string() })).optional(),
      attachments: z.array(z.unknown()).optional(),
    })
    .refine((p) => !p.dm || p.to.length > 0, 'A direct message needs a mention'),
  output: z.object({ postId: z.string() }),
})
/** Drops queued and held deliveries; the client cancels running members itself (the plugin API has no cancel). */
const stopRpc = defineRpc({ name: 'room.stop', input: z.object({ roomId }), output: done })
/** After a pause: resets the loop guard and delivers what was held. */
const continueRpc = defineRpc({ name: 'room.continue', input: z.object({ roomId }), output: done })
/** The room items, oldest first: a timeline rebuilt from provider history drops plugin items. */
const logRpc = defineRpc({
  name: 'room.log',
  input: z.object({ roomId, after: z.iso.datetime({ offset: true }).optional() }),
  output: z.object({ items: z.array(z.object({ id: z.string(), kind: z.string(), data: z.unknown(), timestamp: z.string() })) }),
})

type Item = { id: string; kind: string; data: Record<string, unknown>; timestamp: string }
type Join = { notes?: string; context: z.infer<typeof context>; at: string }
/** What a room keeps on disk, one JSON file per room. */
type RoomFile = { items: Item[]; posts: Post[]; delivered: Record<string, string>; joins: Record<string, Join> }
/** hops: agent-triggered deliveries since the last user post or Continue; held: what the loop guard stopped. */
type Room = { file: RoomFile; hops: number; held: { agentId: string; message: Message }[] }
type Member = { id: string; handle: string; model: string; joined: string }

// shortcut: queues, held deliveries, the loop guard and busy agents live in memory and are lost when the daemon
// restarts (a running agent then counts as idle); persist them in the room file if that bites.
const rooms = new Map<string, Promise<Room>>()
const locks = new Map<string, Promise<unknown>>()
const queues = new Map<string, Message[]>()
const busy = new Set<string>()

const file = (id: string) => join(DIR, `${roomId.parse(id)}.json`)

function load(id: string) {
  let room = rooms.get(id)
  if (!room) {
    const empty: RoomFile = { items: [], posts: [], delivered: {}, joins: {} }
    // A corrupt file throws instead of being overwritten.
    room = readFile(file(id), 'utf8')
      .then(JSON.parse, (e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? empty : Promise.reject(e)))
      .then((saved: RoomFile): Room => ({ file: saved, hops: 0, held: [] }))
    room.catch(() => rooms.delete(id))
    rooms.set(id, room)
  }
  return room
}

async function save(id: string, room: Room) {
  await mkdir(DIR, { recursive: true })
  await writeFile(`${file(id)}.tmp`, JSON.stringify(room.file))
  await rename(`${file(id)}.tmp`, file(id))
}

/** Runs fn with the room, one call per room at a time: hooks and RPCs interleave at every await. */
function withRoom<T>(id: string, fn: (room: Room) => Promise<T>): Promise<T> {
  const run = (locks.get(id) ?? Promise.resolve()).then(async () => {
    const room = await load(id)
    try {
      return await fn(room)
    } finally {
      await save(id, room)
    }
  })
  locks.set(id, run.catch(() => {}))
  return run
}

/** Writes a room item to the room log and the lead's timeline. */
async function addItem(paseo: PaseoApi, id: string, room: Room, kind: string, data: Record<string, unknown>, itemId: string = randomUUID()) {
  const item = { id: itemId, kind, data, timestamp: new Date().toISOString() }
  room.file.items.push(item)
  await save(id, room)
  // The log has it; the lead may be archived.
  await paseo.agents
    .ref(id)
    .timeline.append({ type: 'plugin', id: itemId, kind, version: 1, data: data as never })
    .catch((e: unknown) => console.error(`mypaseo-rooms: appending ${kind} to ${id} failed:`, e))
  return item
}

async function members(paseo: PaseoApi, id: string): Promise<Member[]> {
  const { entries } = await paseo.agents.list({ filter: { labels: { [ROOM]: id } }, page: { limit: 200 } })
  return entries.map(({ agent: a }) => ({ id: a.id, handle: a.labels[HANDLE] ?? 'agent', model: `${a.provider}/${a.model ?? 'default'}`, joined: a.createdAt }))
}

async function labelsOf(paseo: PaseoApi, agentId: string) {
  return (await paseo.agents.ref(agentId).refresh())?.agent.labels ?? {}
}

/** The first delivery's attachment: the client's, or the room posts the member joined with. */
function sharedContext(posts: Post[], join: Join | undefined) {
  if (!join || join.context.kind === 'none') return []
  const c = join.context
  if (c.kind === 'attachment') return [c.attachment]
  const shared = c.kind === 'all' ? sharedPosts(posts, undefined, join.at) : sharedPosts(posts, c.from, c.to ?? join.at)
  return shared.length ? [{ type: 'text', mimeType: 'text/plain', title: 'Room history', text: history(shared) }] : []
}

function enqueue(agentId: string, message: Message) {
  queues.set(agentId, [...(queues.get(agentId) ?? []), message])
}

/** Sends the member its next batch unless it's busy (send would interrupt its turn). */
async function deliver(paseo: PaseoApi, room: Room, ms: Member[], agentId: string) {
  const queue = queues.get(agentId) ?? []
  const me = ms.find((m) => m.id === agentId)
  if (!me || !queue.length || busy.has(agentId)) return
  const batch = nextBatch(queue)
  const deliveryId = randomUUID()
  const at = new Date().toISOString()
  const dm = batch[0].dm
  const join = room.file.joins[agentId]
  const text = deliveryText({
    handle: me.handle,
    others: ms.filter((m) => m !== me),
    notes: join?.notes,
    digest: digest(room.file.posts, { ...me, delivered: room.file.delivered[agentId] }, batch),
    messages: batch,
    marker: marker(deliveryId, dm, at),
  })
  queues.set(agentId, queue.filter((m) => !batch.includes(m)))
  busy.add(agentId)
  try {
    await paseo.agents.ref(agentId).send(text, {
      messageId: `${dm ? 'mpr-dm' : 'mpr'}:${deliveryId}`,
      images: batch.flatMap((m) => m.images ?? []),
      // The daemon validates attachments.
      attachments: [...sharedContext(room.file.posts, join), ...batch.flatMap((m) => m.attachments ?? [])] as never,
    })
  } catch (e) {
    // Not rethrown: the post is already in the room; the batch goes again with the member's next delivery.
    busy.delete(agentId)
    queues.set(agentId, [...batch, ...(queues.get(agentId) ?? [])])
    console.error(`mypaseo-rooms: delivery to ${agentId} failed:`, e)
    return
  }
  delete room.file.joins[agentId]
  room.file.delivered[agentId] = at
}

/** Ends a pause: Continue, Stop and a user post all reset the loop guard. Returns what was held. */
async function unpause(paseo: PaseoApi, id: string, room: Room) {
  const held = room.held
  room.hops = 0
  room.held = []
  if (held.length) await addItem(paseo, id, room, 'room.resumed', {})
  return held
}

export default function contribute(server: PluginServerContext) {
  server.handle(joinRpc, ({ roomId: id, members: joining }, { paseo }) =>
    withRoom(id, async (room) => {
      const lead = (await paseo.agents.ref(id).refresh())?.agent
      if (!lead || lead.archivedAt || lead.labels[ROOM] !== id || !lead.workspaceId)
        throw new Error(`Agent ${id} is no room lead: label it ${ROOM}=${id} first`)
      const taken = (await members(paseo, id)).map((m) => m.handle)
      for (const { handle } of joining) {
        if (taken.includes(handle)) throw new Error(`@${handle} is taken in this room`)
        taken.push(handle)
      }
      const workspace = paseo.workspaces.ref(lead.workspaceId)
      const at = new Date().toISOString()
      const agentIds: string[] = []
      const joined = new Map<string, string[]>() // context summary → handles
      try {
        for (const m of joining) {
          const { provider, model, ...config } = m.config
          const models = model ? [] : ((await paseo.providers.listModels(provider, { cwd: lead.cwd })).models ?? [])
          const modelId = model ?? (models.find((d) => d.isDefault) ?? models[0])?.id
          if (!modelId) throw new Error(`${provider} has no model to pick for @${m.handle}`)
          const labels = { [ROOM]: id, [HANDLE]: m.handle, ...(m.profileId && { [PROFILE]: m.profileId }) }
          const agent = await workspace.agents.create({ config: { ...config, provider: `${provider}/${modelId}` }, labels, title: `@${m.handle}` })
          agentIds.push(agent.id)
          // A systemPrompt from the client carries the role already.
          room.file.joins[agent.id] = { notes: m.config.systemPrompt ? undefined : m.notes, context: m.context, at }
          const summary = contextSummary(m.context)
          joined.set(summary, [...(joined.get(summary) ?? []), m.handle])
        }
      } finally {
        // Also for the members made before a failure.
        for (const [context, handles] of joined) await addItem(paseo, id, room, 'room.join', { handles, context })
      }
      return { agentIds }
    }),
  )

  server.handle(postRpc, ({ roomId: id, text, to, dm, images, attachments }, { paseo }) =>
    withRoom(id, async (room) => {
      const ms = await members(paseo, id)
      if (!ms.length) throw new Error(`No room ${id}`)
      const unknown = to.find((h) => !ms.some((m) => m.handle === h))
      if (unknown) throw new Error(`@${unknown} isn't in this room`)
      const postId = randomUUID()
      const files = (attachments ?? []).map((a) => {
        const { fileName, title, type } = a as { fileName?: string; title?: string; type?: string }
        return fileName ?? title ?? type ?? 'file'
      })
      const { timestamp } = await addItem(paseo, id, room, 'room.post', { id: postId, text, to, dm, images: images?.length ?? 0, files }, postId)
      const post: Post = { id: postId, author: 'user', to, text, at: timestamp }
      if (!dm) room.file.posts.push(post)
      // A new user post starts a new exchange; the posts held so far reach their members in later digests.
      await unpause(paseo, id, room)
      const recipients = to.length ? ms.filter((m) => to.includes(m.handle)) : ms
      for (const m of recipients) enqueue(m.id, { ...post, dm, images, attachments })
      for (const m of recipients) await deliver(paseo, room, ms, m.id)
      return { postId }
    }),
  )

  server.handle(stopRpc, ({ roomId: id }, { paseo }) =>
    withRoom(id, async (room) => {
      for (const m of await members(paseo, id)) queues.delete(m.id)
      await unpause(paseo, id, room)
      return {}
    }),
  )

  server.handle(continueRpc, ({ roomId: id }, { paseo }) =>
    withRoom(id, async (room) => {
      const held = await unpause(paseo, id, room)
      const ms = await members(paseo, id)
      for (const { agentId, message } of held) enqueue(agentId, message)
      for (const agentId of new Set(held.map((h) => h.agentId))) await deliver(paseo, room, ms, agentId)
      return {}
    }),
  )

  server.handle(logRpc, async ({ roomId: id, after }) => ({
    items: (await load(id)).file.items.filter((i) => !after || Date.parse(i.timestamp) > Date.parse(after)),
  }))

  server.on('agent.turn_started', ({ agent }) => {
    busy.add(agent.id)
  })

  server.on('agent.turn_ended', async ({ agent, outcome, timeline }, { paseo }) => {
    // Synchronously, before agent.turn_started of a turn that follows right away (a message typed while it ran).
    busy.delete(agent.id)
    const reply = outcome.kind === 'completed' ? replyText(timeline) : null
    if (!reply && !queues.get(agent.id)?.length) return
    const id = (await labelsOf(paseo, agent.id))[ROOM]
    if (!id) return
    await withRoom(id, async (room) => {
      const ms = await members(paseo, id)
      const me = ms.find((m) => m.id === agent.id)
      if (!me) return
      if (reply) {
        // The timeline's own time, so a context range picked in the view includes the reply.
        const tail = await paseo.agents.ref(agent.id).timeline.refetch({ direction: 'tail', limit: 10 })
        const at = tail.entries.findLast((e) => e.item.type === 'assistant_message')?.timestamp ?? new Date().toISOString()
        const to = mentions(reply, ms.filter((m) => m !== me).map((m) => m.handle))
        const post: Post = { id: randomUUID(), author: me.handle, to, text: reply, at }
        room.file.posts.push(post)
        const wasPaused = room.held.length > 0
        for (const m of ms.filter((m) => to.includes(m.handle))) {
          const message = { ...post, dm: false }
          if (admit(room)) {
            enqueue(m.id, message)
            await deliver(paseo, room, ms, m.id)
          } else room.held.push({ agentId: m.id, message })
        }
        if (!wasPaused && room.held.length) await addItem(paseo, id, room, 'room.paused', { held: room.held.length })
      }
      await deliver(paseo, room, ms, agent.id)
    })
  })

  server.on('agent.archived', async ({ agent }, { paseo }) => {
    busy.delete(agent.id)
    queues.delete(agent.id)
    const labels = await labelsOf(paseo, agent.id)
    const id = labels[ROOM]
    if (id) await withRoom(id, (room) => addItem(paseo, id, room, 'room.leave', { handle: labels[HANDLE] ?? 'agent' }))
  })

  return () => {}
}
