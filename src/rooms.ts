// The only client of the mypaseo-rooms daemon plugin. Its zod schemas in rooms-plugin/index.server.ts are the source of
// truth for these types; change both together. The rules are the Contract in doc/multi-agent-chat.md.
import type { DaemonClient } from './daemon'

/** Agent label keys: the room (its lead's id), the member's handle without `@`, the profile it was made from. */
export const ROOM_LABELS = { room: 'mypaseo.room', handle: 'mypaseo.handle', profile: 'mypaseo.profile' } as const

type MemberConfig = { provider: string; model?: string; thinkingOptionId?: string; modeId?: string; featureValues?: Record<string, unknown>; systemPrompt?: string }
type TextAttachment = { type: 'text'; mimeType: 'text/plain'; title?: string; text: string; contextKind?: string }
/** What a joining member gets with its first delivery. range: ISO timestamps of room items, inclusive. */
type Context =
  | { kind: 'none' }
  | { kind: 'range'; from: string; to?: string }
  | { kind: 'all' }
  | { kind: 'attachment'; attachment: TextAttachment }
type Member = { handle: string; profileId?: string; notes?: string; config: MemberConfig; context: Context }
/** room.post, room.join, room.leave, room.paused, room.resumed; their data is in the Contract. */
type RoomItem = { id: string; kind: string; data: unknown; timestamp: string }

const MISSING = 'Multi-agent chat needs the mypaseo-rooms daemon plugin, see the README'

const rpc = <T>(daemon: DaemonClient, method: string, input: object) =>
  (daemon.invokePluginRpc('mypaseo-rooms', method, input) as Promise<T>).catch((e: unknown) => {
    throw String(e).includes('Plugin is not available: mypaseo-rooms') ? new Error(MISSING, { cause: e }) : e
  })

/** Creates idle members in the lead's workspace. Label the lead (`updateAgent`) before the room's first join. */
export const join = (daemon: DaemonClient, input: { roomId: string; members: Member[] }) => rpc<{ agentIds: string[] }>(daemon, 'room.join', input)
/** `to`: handles, [] = every member. `dm` needs a mention; the replies aren't routed. */
export const post = (
  daemon: DaemonClient,
  input: { roomId: string; text: string; to: string[]; dm: boolean; images?: { data: string; mimeType: string }[]; attachments?: unknown[] },
) => rpc<{ postId: string }>(daemon, 'room.post', input)
/** Drops queued and held deliveries; cancel the running members yourself. */
export const stop = (daemon: DaemonClient, input: { roomId: string }) => rpc<object>(daemon, 'room.stop', input)
/** After a pause: resets the loop guard and delivers what was held. */
export const resume = (daemon: DaemonClient, input: { roomId: string }) => rpc<object>(daemon, 'room.continue', input)
/** The room items from the room log, oldest first; `after` is an ISO time. */
export const log = (daemon: DaemonClient, input: { roomId: string; after?: string }) => rpc<{ items: RoomItem[] }>(daemon, 'room.log', input)
