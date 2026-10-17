import { ArrowUp, Brain, Folder, GitBranch, Loader2, MessageCircle, Paperclip, Plus, Shield, Sparkles, Square, X } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { ActiveViewContext } from '../../activeView'
import { ARTIFACT_PROMPT } from '../../artifact'
import { errorText, type Agent } from '../../daemon'
import { dropImageRef, imageRef } from './imageRefs'
import { formatCombo, isShortcut, useShortcut } from '../../keymap'
import { deleteComments, reviewAttachment, useReview, type ReviewComment } from '../review/review'
import { clickable } from '../../a11y'
import { hostLabel, isScratch, projectName, rememberAgent, useDaemon, useHost, useHostId, useStore } from '../../store'
import { useAutocomplete } from './useAutocomplete'
import { ContextMeter } from './ContextMeter'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Pick } from '../../components/Pick'
import type { Target } from './target'

type Draft = { provider?: string; model?: string; thinking?: string; mode?: string }
// The Settings default wins over the last-used draft, but keeps its mode (permissions) for the same provider.
// Invalid ids fall back to provider defaults below.
const loadDraft = (): Draft => {
  const last: Draft = JSON.parse(localStorage.mypaseoDraft ?? '{}')
  const def: Draft | undefined = localStorage.mypaseoDefaultAgent && JSON.parse(localStorage.mypaseoDefaultAgent)
  return def ? { ...def, mode: def.provider === last.provider ? last.mode : undefined } : last
}

type PastedImage = { data: string; mimeType: string }
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

// Unsent composer text per agent, plus one shared by every "New agent" composer; switching tabs/workspaces remounts Chat. In-memory: lost on reload.
const drafts = new Map<string, string>()
const imageDrafts = new Map<string, PastedImage[]>()
const fileDrafts = new Map<string, File[]>()
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
}: {
  agent?: Agent
  target: Target
  onCreated: (a: Agent) => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string) => void
  onDraftProvider?: (provider: string | undefined) => void
  onShowComment: (c: ReviewComment) => void
}) {
  const daemon = useDaemon()
  const hostId = useHostId()
  const { providers } = useHost()
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
  // Review comments from the workspace's diff and file views go with the next message.
  const reviewCwd = target.workspace?.workspaceDirectory
  const review = useReview(reviewCwd)
  const [busy, setBusy] = useState(false)
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
  const provider = agent?.provider ?? (usable.some((p) => p.provider === draft.provider) ? draft.provider : usable[0]?.provider)
  const entry = providers.find((p) => p.provider === provider)
  useEffect(() => {
    if (!agent) onDraftProvider?.(provider)
  }, [agent, provider]) // eslint-disable-line react-hooks/exhaustive-deps
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const modelId = agent ? (agent.runtimeInfo?.model ?? agent.model) : draft.model
  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.isDefault) ?? models[0]
  const thinkingOptions = model?.thinkingOptions ?? []
  const thinking = agent ? (agent.thinkingOptionId ?? agent.effectiveThinkingOptionId) : draft.thinking
  const modes = agent ? agent.availableModes : (entry?.modes ?? [])
  const mode = agent ? agent.currentModeId : (draft.mode ?? entry?.defaultModeId)
  const validThinking = (thinkingOptions.some((o) => o.id === thinking) ? thinking : model?.defaultThinkingOptionId) ?? undefined
  const cwd = agent?.cwd ?? target.workspace?.workspaceDirectory ?? target.rootPath
  const ac = useAutocomplete({
    input,
    text,
    setText,
    cwd,
    agentId: agent?.id,
    draftConfig: !agent && provider ? { provider, cwd, model: model?.id } : undefined,
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
      if (agent) {
        await daemon.sendAgentMessage(agent.id, prompt, { images, attachments })
      } else if (provider) {
        const config = {
          provider,
          model: model?.id,
          thinkingOptionId: validThinking,
          modeId: modes.some((m) => m.id === mode) ? (mode ?? undefined) : undefined,
          initialPrompt: prompt,
          systemPrompt: ARTIFACT_PROMPT,
          images,
          attachments,
        }
        const { workspace } = target
        if (workspace) {
          const created = await daemon.createAgent({ ...config, cwd: workspace.workspaceDirectory, workspaceId: workspace.id })
          onCreated(rememberAgent(hostId, created))
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
          onCreated(rememberAgent(hostId, res.agent))
        }
      }
      setText('')
      setImages([])
      setFiles([])
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
  return (
    <div className="composer">
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
              <img src={`data:${img.mimeType};base64,${img.data}`} alt={`Pasted image ${i + 1}`} />
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
      <textarea
        name="prompt"
        ref={input}
        value={text}
        placeholder={agent ? 'Message the agent…' : provider ? 'What should the agent do?' : 'No ready providers — check Settings'}
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
          if (isShortcut(e, 'send')) {
            e.preventDefault()
            void send()
          } else if (isShortcut(e, 'cycleThinking') && thinkingOptions.length > 0) {
            e.preventDefault()
            const i = thinkingOptions.findIndex((o) => o.id === validThinking)
            change('thinking', thinkingOptions[(i + 1) % thinkingOptions.length].id)
          } else if (isShortcut(e, 'pickModel') && modelSelect.current) {
            e.preventDefault()
            openPicker(modelSelect.current)
          } else if (isShortcut(e, 'pickProject') && projectSelect.current) {
            e.preventDefault()
            openPicker(projectSelect.current)
          }
        }}
      />
      <div className="composer-bar">
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
          <Pick ref={modelSelect} icon={<Sparkles size={14} />} value={model?.id} onChange={(v) => change('model', v)} options={models.map((m) => [m.id, m.label])} title="Model" />
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
        {agent?.status === 'running' && empty ? (
          <button className="send stop" title="Stop" onClick={() => void daemon.cancelAgent(agent.id)}>
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
