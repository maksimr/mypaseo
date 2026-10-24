import { ArrowUp, Brain, Folder, GitBranch, Loader2, Lock, MessageCircle, Paperclip, Plus, Shield, Sparkles, Square, X } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { ActiveViewContext } from '../../activeView'
import { ARTIFACT_PROMPT } from '../../artifact'
import { errorText, type Agent, type AgentProfile, type DaemonClient, type ProviderEntry } from '../../daemon'
import * as rooms from '../../rooms'
import { RESERVED, slug, uniqueHandle } from '../rooms/handles'
import { JoinChip } from '../rooms/JoinChip'
import { handleOf, roomId, roomMembers } from '../rooms/members'
import { mentions } from '../rooms/mentions'
import { mentionAt, unmention } from './autocomplete'
import { contextOptions, forkEnd, forkId, hhmm, pickRange, type ForkPoint, type Mark, type Share } from './share'
import { dropImageRef, imageRef } from './imageRefs'
import { ImageEditor, type PastedImage } from './ImageEditor'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import { deleteComments, reviewAttachment, useReview, type ReviewComment } from '../review/review'
import { clickable } from '../../a11y'
import { hostLabel, isScratch, projectName, rememberAgent, useDaemon, useHost, useHostId, useStore } from '../../store'
import { useAutocomplete } from './useAutocomplete'
import { ContextMeter } from './ContextMeter'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Pick } from '../../components/Pick'
import { modelOptions } from '../../modelOptions'
import type { Target } from './target'

type Draft = { provider?: string; model?: string; thinking?: string; mode?: string }
// The Settings default wins over the last-used draft, but keeps its mode (permissions) for the same provider.
// Invalid ids fall back to provider defaults below.
const loadDraft = (): Draft => {
  const last: Draft = JSON.parse(localStorage.mypaseoDraft ?? '{}')
  const def: Draft | undefined = localStorage.mypaseoDefaultAgent && JSON.parse(localStorage.mypaseoDefaultAgent)
  return def ? { ...def, mode: def.provider === last.provider ? last.mode : undefined } : last
}

const readImage = (file: File) =>
  new Promise<PastedImage>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ mimeType: file.type, data: (r.result as string).split(',')[1] })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
// Providers take these inline; any other file is uploaded to the daemon and attached by its path there.
const inlineImage = (f: File) => /^image\/(png|jpeg|gif|webp)$/.test(f.type)
const MAX_FILE_BYTES = 50 * 1024 * 1024 // the Paseo app's limit; the daemon sets none

/** The provider's selectable models, the picked one (else its default) and a thinking level it offers (else its default). */
function modelConfig(entry: ProviderEntry | undefined, modelId: string | null | undefined, thinking: string | null | undefined) {
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.isDefault) ?? models[0]
  const thinkingOptions = model?.thinkingOptions ?? []
  const validThinking = (thinkingOptions.some((o) => o.id === thinking) ? thinking : model?.defaultThinkingOptionId) ?? undefined
  return { models, model, thinkingOptions, validThinking }
}

/** The system prompt of every agent made here, room members included: the artifact rules, plus a profile's notes as its role. */
const systemPromptOf = (profile?: AgentProfile) => (profile?.notes ? `${ARTIFACT_PROMPT}\n\nYour role: ${profile.notes}` : ARTIFACT_PROMPT)

// Unsent composer text per agent, plus one shared by every "New agent" composer; switching tabs/workspaces remounts Chat. In-memory: lost on reload.
const drafts = new Map<string, string>()
const imageDrafts = new Map<string, PastedImage[]>()
const fileDrafts = new Map<string, File[]>()
/** The Model, Thinking and Context (a contextOptions id) picked on joining chips, by handle. */
type JoinPick = { handle: string; model?: string; thinking?: string; context?: string }
const joinDrafts = new Map<string, JoinPick[]>()
/** The messages picked with Share From Here. */
const shareDrafts = new Map<string, Share>()
/** The drafts with Direct Message on. */
const dmDrafts = new Set<string>()
// useState for a draft list that outlives remounts. Updaters read the stored list, so a paste that finishes after unmount still lands.
function useDraftList<T>(store: Map<string, T[]>, key: string) {
  const [list, setList] = useState(() => store.get(key) ?? [])
  const set = (next: T[] | ((prev: T[]) => T[])) => {
    const v = typeof next === 'function' ? next(store.get(key) ?? []) : next
    setList(v)
    if (v.length) store.set(key, v)
    else store.delete(key)
  }
  return [list, set] as const
}

export function Composer({
  agent,
  target,
  onCreated,
  initialText,
  onInitialTextUsed,
  onProjectChange,
  onDraftProvider,
  onShowComment,
  share,
  forks = [],
}: {
  agent?: Agent
  target: Target
  onCreated: (a: Agent) => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string) => void
  onDraftProvider?: (provider: string | undefined) => void
  onShowComment: (c: ReviewComment) => void
  /** Share From Here on a message (Chat); a new object each time. */
  share?: { mark: Mark; end: boolean }
  /** In a chat without a room: the messages a fork of its agent can end at, oldest first. */
  forks?: ForkPoint[]
}) {
  const daemon = useDaemon()
  const hostId = useHostId()
  const { providers, profiles, agents } = useHost()
  const { hosts, projects } = useStore()
  const draftKey = agent ? `${hostId}/${agent.id}` : 'new'
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? '')
  const setText = (t: string) => {
    setTextState(t)
    if (t) drafts.set(draftKey, t)
    else drafts.delete(draftKey)
  }
  // Joins the draft on mount and, for a chat kept mounted behind another tab, whenever it's handed over.
  useEffect(() => {
    if (!initialText) return
    // eslint-disable-next-line react/set-state-in-effect -- a hand-off from App, which clears it
    setText(text ? `${text}${/\s$/.test(text) ? '' : ' '}${initialText}` : initialText)
    onInitialTextUsed?.()
  }, [initialText]) // eslint-disable-line react-hooks/exhaustive-deps
  const [images, setImages] = useDraftList(imageDrafts, draftKey)
  const [files, setFiles] = useDraftList(fileDrafts, draftKey)
  const [editing, setEditing] = useState<number | null>(null)
  // Review comments from the workspace's diff and file views go with the next message.
  const reviewCwd = target.workspace?.workspaceDirectory
  const review = useReview(reviewCwd)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const isGit = projects.find((p) => p.projectId === target.projectId)?.projectKind === 'git'
  const [worktree, setWorktree] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const sendKey = useShortcut('send')
  const input = useRef<HTMLTextAreaElement>(null)
  const modelSelect = useRef<HTMLSelectElement>(null)
  const projectSelect = useRef<HTMLSelectElement>(null)
  const openPicker = (el: HTMLSelectElement) => {
    el.focus()
    // showPicker is missing in older Safari; focus alone still lets Space/arrows open it.
    try {
      el.showPicker()
    } catch {}
  }
  // On showing: a new chat takes focus, and so do the remount after a send creates its agent and a return to the tab
  // (focus fell to <body>, or is still in the tab just hidden).
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    const el = input.current
    const a = document.activeElement
    if (!active || !el || (agent && a !== document.body && !a?.closest('[inert]'))) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length) // after any inserted selection ref
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraftState] = useState<Draft>(loadDraft)
  const setDraft = (d: Draft) => {
    setDraftState(d)
    localStorage.mypaseoDraft = JSON.stringify(d)
  }

  const usable = providers.filter((p) => p.enabled && p.status === 'ready')
  const ready = (id: string | undefined) => (usable.some((p) => p.provider === id) ? id : usable[0]?.provider)
  const provider = agent?.provider ?? ready(draft.provider)
  const entry = providers.find((p) => p.provider === provider)
  useEffect(() => {
    if (!agent) onDraftProvider?.(provider)
  }, [agent, provider]) // eslint-disable-line react-hooks/exhaustive-deps
  const modelId = agent ? (agent.runtimeInfo?.model ?? agent.model) : draft.model
  const thinking = agent ? (agent.thinkingOptionId ?? agent.effectiveThinkingOptionId) : draft.thinking
  const { models, model, thinkingOptions, validThinking } = modelConfig(entry, modelId, thinking)
  const modes = agent ? agent.availableModes : (entry?.modes ?? [])
  const mode = agent ? agent.currentModeId : (draft.mode ?? entry?.defaultModeId)

  // Group chats (doc/multi-agent-chat.md): the chat's members, and the agents a mention adds on send.
  const room = agent && roomId(agent)
  const members = agent ? (room ? roomMembers(agents, room) : [agent]) : []
  const memberHandles = members.map((m) => handleOf(m, profiles))
  const defaultAgent = loadDraft()
  // In a chat that has an @agent, the next default agent is @agent-2.
  const defaultHandle = uniqueHandle('agent', memberHandles)
  const candidates = [
    ...profiles
      .filter((p) => slug(p.name) && !RESERVED.includes(slug(p.name)))
      .map((p) => ({ handle: slug(p.name), provider: p.provider, description: p.notes, profile: p })),
    { handle: defaultHandle, provider: ready(defaultAgent.provider), description: 'Default agent', profile: undefined },
  ].filter((c, i, all) => !memberHandles.includes(c.handle) && all.findIndex((x) => x.handle === c.handle) === i)
  const mentioned = mentions(text, [...memberHandles, ...candidates.map((c) => c.handle)])
  const [joinPicks, setJoinPicks] = useDraftList(joinDrafts, draftKey)
  const [shared, setSharedState] = useState(() => shareDrafts.get(draftKey))
  const setShared = (s: Share | undefined) => {
    setSharedState(s)
    if (s) shareDrafts.set(draftKey, s)
    else shareDrafts.delete(draftKey)
  }
  const contexts = contextOptions(shared, !!room, forks)
  const joining = mentioned
    .flatMap((h) => candidates.filter((c) => c.handle === h))
    .map(({ profile: p, ...c }) => {
      const pick = joinPicks.find((j) => j.handle === c.handle)
      const e = providers.find((x) => x.provider === c.provider)
      const picked = modelConfig(e, pick?.model ?? (p ? p.model : defaultAgent.model), pick?.thinking ?? (p ? p.thinkingOptionId : defaultAgent.thinking))
      const modeId = p ? p.modeId : (e?.modes ?? []).some((m) => m.id === defaultAgent.mode) ? defaultAgent.mode : undefined
      const context = contexts.find(([id]) => id === pick?.context)?.[0] ?? 'none'
      return { ...c, ...picked, profile: p, modeId, context }
    })
  // Direct Message (the lock): the post goes to the mentioned members only, and their replies stay out of the room.
  const [locked, setLockedState] = useState(() => dmDrafts.has(draftKey))
  const setLocked = (on: boolean) => {
    setLockedState(on)
    if (on) dmDrafts.add(draftKey)
    else dmDrafts.delete(draftKey)
  }
  const dm = locked && mentioned.length > 0
  const pickJoin = (handle: string, pick: Omit<JoinPick, 'handle'>) =>
    setJoinPicks((prev) => [...prev.filter((j) => j.handle !== handle), { ...prev.find((j) => j.handle === handle), ...pick, handle }])
  const configOf = (j: (typeof joining)[number]) => {
    if (!j.provider) throw new Error(`No ready provider for @${j.handle}`)
    return {
      provider: j.provider,
      model: j.model?.id,
      thinkingOptionId: j.validThinking,
      modeId: j.modeId,
      featureValues: j.profile?.featureValues,
      systemPrompt: systemPromptOf(j.profile),
    }
  }
  const running = members.filter((m) => m.status === 'running')
  // What a joining member gets with its first delivery: the picked range, the whole room, or its author's session up to
  // the range's last message.
  const contextOf = async (id: string) => {
    const end = id === 'fork' ? forkEnd(shared) : forks.find((f) => forkId(f) === id)
    if (id === 'range' && shared) return { kind: 'range' as const, from: shared.from.at, to: shared.to?.at }
    if (id === 'all') return { kind: 'all' as const }
    if (end?.messageId) {
      const { attachment } = await daemon.buildAgentForkContext(end.agentId, { boundaryMessageId: end.messageId })
      const { text, contextKind } = attachment!
      return { kind: 'attachment' as const, attachment: { type: 'text' as const, mimeType: 'text/plain' as const, title: `fork of @${end.handle} up to ${hhmm(end.at)}`, text, contextKind } }
    }
    return { kind: 'none' as const }
  }
  // Share From Here: the message sets every joining chip's context, or a mention adds the default agent to take it.
  // Without a room there are no posts to range over: a fork at the range's end.
  useEffect(() => {
    if (!share) return
    const next = pickRange(shared, share.mark, share.end)
    // eslint-disable-next-line react/set-state-in-effect -- a hand-off from Chat, a new object per pick
    setShared(next)
    if (!joining.length) setText(`@${defaultHandle} ${text}`)
    for (const h of joining.length ? joining.map((j) => j.handle) : [defaultHandle]) pickJoin(h, { context: room ? 'range' : forkId(next.to ?? next.from) })
  }, [share]) // eslint-disable-line react-hooks/exhaustive-deps

  const cwd = agent?.cwd ?? target.workspace?.workspaceDirectory ?? target.rootPath
  const ac = useAutocomplete({
    input,
    text,
    setText,
    cwd,
    agentId: agent?.id,
    draftConfig: !agent && provider ? { provider, cwd, model: model?.id } : undefined,
    agents: [...members.map((m, i) => ({ handle: memberHandles[i], provider: m.provider, description: 'In this chat' })), ...candidates],
  })

  const change = (field: keyof Draft, value: string) => {
    if (!agent) return setDraft({ ...draft, provider, [field]: value, ...(field === 'provider' ? { model: undefined, thinking: undefined, mode: undefined } : {}) })
    const call =
      field === 'model'
        ? daemon.setAgentModel(agent.id, value)
        : field === 'thinking'
          ? daemon.setAgentThinkingOption(agent.id, value)
          : daemon.setAgentMode(agent.id, value)
    call.catch((e) => alert(errorText(e)))
  }

  const clearDraft = () => {
    setText('')
    setImages([])
    setFiles([])
    setJoinPicks([])
    setLocked(false)
    setShared(undefined)
  }
  // In a room: every running member, then the deliveries the plugin still queues or holds.
  const stop = async () => {
    try {
      await Promise.all(running.map((m) => daemon.cancelAgent(m.id)))
      if (room) await rooms.stop(daemon, { roomId: room })
    } catch (e) {
      alert(`Stop failed: ${errorText(e)}`)
    }
  }

  const send = async () => {
    const comments = review.comments
    // Like Paseo desktop's Send Feedback; without text the chat would show an empty message.
    const prompt = text.trim() || (comments.length ? 'Please address this code review.' : '')
    if ((!prompt && !images.length && !files.length) || busy) return
    setBusy(true)
    try {
      // At send, not at pick: removed files never reach the daemon, and the upload lands on the host that runs the agent.
      const attachments = []
      for (const f of files) {
        const res = await daemon.uploadFile({ fileName: f.name, mimeType: f.type || 'application/octet-stream', bytes: await f.arrayBuffer() })
        if (!res.file) throw new Error(res.error ?? `Upload of ${f.name} failed`)
        attachments.push(res.file)
      }
      if (comments.length) attachments.push(reviewAttachment(reviewCwd!, comments))
      // Joins the mentioned non-members and posts to the room, which a lead without one starts. The room log goes
      // first: a missing plugin fails before the label makes this chat a room.
      const toRoom = async (a: Agent, handle: string, attachments: unknown[]) => {
        let id = roomId(a)
        if (!id) {
          await rooms.log(daemon, { roomId: a.id })
          await daemon.updateAgent(a.id, { labels: { [rooms.ROOM_LABELS.room]: a.id, [rooms.ROOM_LABELS.handle]: handle } })
          id = a.id
        }
        const join = joining.filter((j) => j.handle !== handle)
        if (join.length)
          await rooms.join(daemon, {
            roomId: id,
            members: await Promise.all(
              join.map(async (j) => ({ handle: j.handle, profileId: j.profile?.id, notes: j.profile?.notes, config: configOf(j), context: await contextOf(j.context) })),
            ),
          })
        await rooms.post(daemon, { roomId: id, text: prompt, to: mentioned, dm, images, attachments })
      }
      // In the target's workspace, else in a new workspace (or scratch folder) of its project.
      const create = async (config: Omit<Parameters<DaemonClient['createAgent']>[0], 'cwd' | 'workspaceId'>) => {
        const { workspace } = target
        if (workspace) {
          const created = await daemon.createAgent({ ...config, cwd: workspace.workspaceDirectory, workspaceId: workspace.id })
          return rememberAgent(hostId, created)
        } else {
          const scratch = isScratch(target.rootPath)
          let path = target.rootPath
          if (scratch) {
            // Each scratch gets its own folder, named by its UTC start time.
            const name = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
            const dir = await daemon.createFileEntry({ cwd: path, parentPath: '.', name, kind: 'directory' })
            if (!dir.success) throw new Error(dir.error ?? 'Could not create the scratch folder')
            path = `${path}/${name}`
          }
          const res = await daemon.createWorkspace({
            source:
              worktree && isGit
                ? // daemon branches off the default branch; an empty name gets a generated one
                  { kind: 'worktree', cwd: target.rootPath, projectId: target.projectId, worktreeSlug: worktreeName.trim() || undefined }
                : { kind: 'directory', path, projectId: target.projectId },
            agent: { ...config, cwd: path },
            // The daemon titles the workspace after the prompt, instead of the timestamp folder.
            firstAgentContext: scratch ? { prompt } : undefined,
          })
          if (res.error || !res.agent) throw new Error(res.error ?? 'Workspace was created without an agent')
          return rememberAgent(hostId, res.agent)
        }
      }
      if (agent && !room && !joining.length) {
        await daemon.sendAgentMessage(agent.id, prompt, { images, attachments })
      } else if (agent) {
        await toRoom(agent, memberHandles[0], attachments)
      } else if (provider) {
        // One mention: that agent instead of the composer's picks. More: the first leads, without a prompt, a room the rest join.
        const [first, ...rest] = joining
        const config = first
          ? { ...configOf(first), labels: first.profile && { [rooms.ROOM_LABELS.profile]: first.profile.id } }
          : {
              provider,
              model: model?.id,
              thinkingOptionId: validThinking,
              modeId: modes.some((m) => m.id === mode) ? (mode ?? undefined) : undefined,
              systemPrompt: systemPromptOf(),
            }
        if (!rest.length) onCreated(await create({ ...config, initialPrompt: prompt, images, attachments }))
        else {
          // Else the daemon titles it after its first message, the plugin's delivery.
          const lead = await create({ ...config, title: prompt.split('\n')[0].slice(0, 60).trim() || `@${first.handle}` })
          try {
            await toRoom(lead, first.handle, attachments)
          } catch (e) {
            // Its chat takes the draft, so a retry there makes no second lead.
            const key = `${hostId}/${lead.id}`
            drafts.set(key, text)
            imageDrafts.set(key, images)
            fileDrafts.set(key, files)
            joinDrafts.set(key, joinPicks)
            clearDraft()
            throw e
          } finally {
            onCreated(lead)
          }
        }
      }
      clearDraft()
      // Only the sent ones: comments added while sending stay.
      deleteComments(review.key, comments.map((c) => c.id))
    } catch (e) {
      alert(`Send failed: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // At the cursor and on the native undo stack, like autocomplete; into the stored draft if Chat unmounted mid-read.
  const insertText = (s: string) => {
    const el = input.current
    if (!el) return setText((drafts.get(draftKey) ?? '') + s)
    if (document.activeElement === el && document.execCommand('insertText', false, s)) return
    el.setRangeText(s, el.selectionStart, el.selectionEnd, 'end')
    setText(el.value)
  }

  // Returns whether any files were found, so paste can fall back to text.
  const addFiles = (picked: File[]) => {
    const big = picked.filter((f) => f.size > MAX_FILE_BYTES)
    if (big.length) alert(`Not attached, over 50 MB: ${big.map((f) => f.name).join(', ')}`)
    const ok = picked.filter((f) => f.size <= MAX_FILE_BYTES)
    const others = ok.filter((f) => !inlineImage(f))
    if (others.length) setFiles((prev) => [...prev, ...others])
    const imgs = ok.filter(inlineImage)
    if (imgs.length)
      Promise.all(imgs.map(readImage))
        .then((read) => {
          const start = (imageDrafts.get(draftKey)?.length ?? 0) + 1
          setImages((prev) => [...prev, ...read])
          insertText(read.map((_, k) => imageRef(start + k)).join(' ') + ' ')
        })
        .catch((err) => alert(`Image failed: ${errorText(err)}`))
    return picked.length > 0
  }

  const empty = !text.trim() && !images.length && !files.length && !review.comments.length
  const n = review.comments.length
  const reviewPaths = [...new Set(review.comments.map((c) => c.path))]
  // Only file drags: dragged text keeps the textarea's native drop.
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      className={`composer${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(false)
        // A dropped folder comes through as a File that can't be read; skip it.
        const items = [...e.dataTransfer.items].filter((it) => it.kind === 'file')
        const dirs = items.filter((it) => it.webkitGetAsEntry()?.isDirectory)
        if (dirs.length) alert(`Folders not attached: ${dirs.map((it) => it.getAsFile()?.name).join(', ')}`)
        addFiles(items.filter((it) => !dirs.includes(it)).flatMap((it) => it.getAsFile() ?? []))
      }}
    >
      {ac.popup}
      {images.length + files.length + n > 0 && (
        <div className="composer-images">
          {reviewPaths.map((path) => {
            const cs = review.comments.filter((c) => c.path === path)
            const count = cs.length === 1 ? '1 comment' : `${cs.length} comments`
            return (
              <span key={`review${path}`} className="composer-image composer-file" title={cs.map((c) => c.ref).join('\n')} {...clickable(() => onShowComment(cs[0]))}>
                <span className="composer-review">
                  <MessageCircle size={12} />
                  {path.split('/').pop()}
                  <span>{count}</span>
                </span>
                <button
                  title="Remove"
                  aria-label={`Remove Review of ${path}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete ${cs.length === 1 ? 'the review comment' : `all ${cs.length} review comments`} on ${path}?`)) deleteComments(review.key, cs.map((c) => c.id))
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            )
          })}
          {images.map((img, i) => (
            <span key={i} className="composer-image">
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Pasted image ${i + 1}`}
                title="Draw on Image"
                aria-label={`Draw on Image ${i + 1}`}
                {...clickable(() => setEditing(i))}
              />
              <button
                title="Remove"
                aria-label={`Remove Image ${i + 1}`}
                onClick={() => {
                  setImages(images.filter((_, j) => j !== i))
                  setText(dropImageRef(text, i + 1))
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {editing !== null && images[editing] && (
            <ImageEditor
              image={images[editing]}
              n={editing + 1}
              onSave={(img) => {
                setImages((prev) => prev.map((im, j) => (j === editing ? img : im)))
                setEditing(null)
                input.current?.focus()
              }}
              onClose={() => {
                setEditing(null)
                input.current?.focus()
              }}
            />
          )}
          {files.map((f, i) => (
            <span key={`file${i}`} className="composer-image composer-file" title={f.name}>
              <Paperclip size={14} />
              <span>{f.name}</span>
              <button title="Remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {joining.length > 0 && (
        <div className="join-chips">
          {joining.map((j) => (
            <JoinChip
              key={j.handle}
              handle={j.handle}
              provider={j.provider}
              model={j.model?.id}
              models={modelOptions(j.models)}
              thinking={j.validThinking}
              thinkingOptions={j.thinkingOptions.map((o) => [o.id, o.label])}
              onModel={(model) => pickJoin(j.handle, { model })}
              onThinking={(thinking) => pickJoin(j.handle, { thinking })}
              context={j.context}
              contexts={contexts}
              onContext={(context) => pickJoin(j.handle, { context })}
              onRemove={() => {
                setText(unmention(text, j.handle))
                setJoinPicks(joinPicks.filter((x) => x.handle !== j.handle))
                input.current?.focus() // the focused button goes with its chip
              }}
            />
          ))}
        </div>
      )}
      <textarea
        name="prompt"
        ref={input}
        value={text}
        placeholder={agent ? (members.length > 1 ? 'Message everyone…' : 'Message the agent…') : provider ? 'What should the agent do?' : 'No ready providers — check Settings'}
        rows={2}
        {...ac.inputProps}
        onChange={(e) => {
          setText(e.target.value)
          ac.track(e.target)
        }}
        onSelect={(e) => ac.track(e.currentTarget)}
        onPaste={(e) => {
          if (addFiles([...e.clipboardData.files])) e.preventDefault()
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || ac.onKeyDown(e)) return
          // On the joining chip whose mention holds the caret, else on the agent.
          const chip = joining.find((j) => j.handle === mentionAt(text, e.currentTarget.selectionStart))
          const levels = chip ? chip.thinkingOptions : thinkingOptions
          if (isShortcut(e, 'send')) {
            e.preventDefault()
            void send()
          } else if (isShortcut(e, 'cycleThinking') && levels.length > 0) {
            e.preventDefault()
            const next = levels[(levels.findIndex((o) => o.id === (chip ? chip.validThinking : validThinking)) + 1) % levels.length].id
            if (chip) pickJoin(chip.handle, { thinking: next })
            else change('thinking', next)
          } else if (isShortcut(e, 'pickModel') && modelSelect.current) {
            e.preventDefault()
            openPicker(modelSelect.current)
          } else if (isShortcut(e, 'pickProject') && projectSelect.current) {
            e.preventDefault()
            openPicker(projectSelect.current)
          }
        }}
      />
      <div className={agent ? 'composer-bar' : 'composer-bar new-agent'}>
        <button className="icon-btn composer-add" title="Attach Files" onClick={() => fileInput.current?.click()}>
          <Plus size={16} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {!agent && (
          <Pick
            ref={projectSelect}
            icon={<Folder size={14} />}
            value={target.projectId}
            onChange={onProjectChange}
            options={projects.map((p) => [p.projectId, `${projectName(p)}${hosts.length > 1 ? ` · ${hostLabel(p.hostId)}` : ''}`])}
            title="Project"
          />
        )}
        {!agent && !target.workspace && isGit && (
          <Pick
            icon={<GitBranch size={14} />}
            value={worktree ? 'worktree' : 'local'}
            onChange={(v) => setWorktree(v === 'worktree')}
            options={[
              ['local', 'Local'],
              ['worktree', 'Worktree'],
            ]}
            title="Workspace"
          />
        )}
        {!agent && !target.workspace && isGit && worktree && (
          <input
            className="worktree-name"
            name="worktreeName"
            aria-label="Worktree Name"
            placeholder="Worktree name"
            title="Worktree name (empty: generated)"
            value={worktreeName}
            onChange={(e) => setWorktreeName(e.target.value)}
          />
        )}
        {!agent && (
          <Pick
            icon={<ProviderIcon provider={provider} />}
            value={provider}
            onChange={(v) => change('provider', v)}
            options={usable.map((p) => [p.provider, p.label ?? p.provider])}
            title="Provider"
          />
        )}
        {models.length > 0 && (
          <Pick ref={modelSelect} icon={<Sparkles size={14} />} value={model?.id} onChange={(v) => change('model', v)} options={modelOptions(models)} title="Model" />
        )}
        {thinkingOptions.length > 0 && (
          <Pick
            icon={<Brain size={14} />}
            value={validThinking}
            onChange={(v) => change('thinking', v)}
            options={thinkingOptions.map((o) => [o.id, o.label])}
            title="Thinking"
          />
        )}
        {modes.length > 0 && (
          <Pick icon={<Shield size={14} />} value={mode ?? undefined} onChange={(v) => change('mode', v)} options={modes.map((m) => [m.id, m.label])} title="Mode" />
        )}
        <span className="grow" />
        {agent && <ContextMeter agent={agent} />}
        {agent && (room || joining.length > 0) && (
          <button
            className={`icon-btn composer-lock ${dm ? 'on' : ''}`}
            title="Direct Message"
            aria-pressed={dm}
            disabled={!mentioned.length}
            onClick={() => setLocked(!locked)}
          >
            <Lock size={14} />
          </button>
        )}
        {running.length > 0 && empty ? (
          <button className="send stop" title="Stop" onClick={() => void stop()}>
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button className="send" title={`Send (${formatCombo(sendKey)})`} disabled={empty || busy || !provider} onClick={() => void send()}>
            {busy ? <Loader2 size={14} className="spin" /> : <ArrowUp size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}
