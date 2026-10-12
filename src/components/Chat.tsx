import { ArrowDown, ArrowUp, Brain, ChevronDown, Folder, GitBranch, Import, Loader2, Paperclip, Plus, Shield, ShieldQuestion, Sparkles, Square, SquarePen, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { errorText, type Agent, type Permission, type Workspace } from '../daemon'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { hostLabel, keptUnread, rememberAgent, useDaemon, useHost, useHostId, useStore } from '../store'
import { useAutocomplete } from '../useAutocomplete'
import { useTimeline } from '../useTimeline'
import { ContextMeter } from './ContextMeter'
import { ProviderIcon } from './ProviderIcon'
import { Timeline, ToolDetailView } from './Timeline'

export type Target = { projectId: string; name: string; rootPath: string; workspace?: Workspace }

/** Whether the user is writing in the composer: it has focus and unsent text. */
const typing = (composer: HTMLElement | null) => {
  const a = document.activeElement
  return a instanceof HTMLTextAreaElement && !!composer?.contains(a) && a.value !== ''
}

export function Chat({
  agent,
  target,
  onCreated,
  onImport,
  initialText,
  onInitialTextUsed,
  onProjectChange,
  onDraftProvider,
}: {
  agent: Agent | undefined
  target: Target
  onCreated: (agent: Agent) => void
  onImport: () => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string) => void
  onDraftProvider?: (provider: string | undefined) => void
}) {
  const daemon = useDaemon()
  const tl = useTimeline(agent?.id ?? null)
  const running = agent?.status === 'running'
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [away, setAway] = useState(false)
  // Scrolling up to read hides the composer; reaching the bottom or Write Message brings it back.
  // Pending permissions keep it, so the floating button never covers their cards.
  const foot = useRef<HTMLDivElement>(null)
  const lastTop = useRef(0)
  const [hide, setHide] = useState(false)
  const composerHidden = hide && !agent?.pendingPermissions.length
  const jumpKey = useShortcut('jumpToLatest')
  const jumpToLatest = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, 'jumpToLatest')) return
      if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault() // Ctrl+End still moves the composer caret
      jumpToLatest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Stick to the bottom while streaming unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [tl.items, agent?.pendingPermissions.length])
  // And while the chat or its timeline resizes, as when the composer slides in or grows, or markdown near the bottom gets parsed.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(el)
    const content = el.querySelector('.timeline')
    if (content) ro.observe(content)
    return () => ro.disconnect()
  }, [])
  // Viewing an agent acknowledges its "finished" / "error" attention flag, except a Mark Unread made while it's open.
  const agentId = agent?.id
  useEffect(() => {
    if (agentId) keptUnread.delete(agentId) // opening it reads it
  }, [agentId])
  useEffect(() => {
    if (agentId && !agent?.requiresAttention) keptUnread.delete(agentId) // so finishing again while open reads it
    else if (agent?.requiresAttention && !agent.pendingPermissions.length && !keptUnread.has(agentId!)) void daemon.clearAgentAttention(agentId!).catch(() => {})
  }, [daemon, agentId, agent?.requiresAttention, agent?.pendingPermissions.length])

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
          const up = el.scrollTop < lastTop.current
          lastTop.current = el.scrollTop
          atBottom.current = fromBottom < 40
          setAway(!atBottom.current)
          if (atBottom.current) setHide(false)
          // Only this far up does the space it frees stay short of the bottom; else it would show again at once.
          else if (up && fromBottom > (foot.current?.offsetHeight ?? 0) + 40 && !typing(foot.current)) {
            setHide(true)
            foot.current?.querySelector('textarea')?.blur() // closes a touch keyboard
          }
        }}
      >
        {agent ? (
          <>
            {tl.loading && <div className="empty">Loading…</div>}
            {tl.error && <div className="empty err">{tl.error}</div>}
            <Timeline items={tl.items} running={running} />
            {agent.lastError && agent.status === 'error' && <div className="msg error pre-wrap">{agent.lastError}</div>}
            {away && (
              <button className="jump-latest" onClick={jumpToLatest}>
                <ArrowDown size={13} /> Jump to Latest Message ({formatCombo(jumpKey)})
              </button>
            )}
          </>
        ) : (
          <div className="empty-chat">
            <h2>New agent</h2>
            <p className="muted">
              {target.workspace
                ? `Starts in ${target.workspace.title || target.workspace.name}`
                : `Starts a new workspace in ${target.name}`}
            </p>
            <button className="btn ghost" onClick={onImport}>
              <Import size={13} /> Import Session
            </button>
          </div>
        )}
      </div>
      {agent?.pendingPermissions.map((p) => <PermissionCard key={p.id} agentId={agent.id} request={p} />)}
      {/* Hidden, not unmounted: the draft and attachments stay. */}
      <div ref={foot} hidden={composerHidden}>
        <Composer
          agent={agent}
          target={target}
          onCreated={onCreated}
          initialText={initialText}
          onInitialTextUsed={onInitialTextUsed}
          onProjectChange={onProjectChange}
          onDraftProvider={onDraftProvider}
        />
      </div>
      {composerHidden && (
        <button
          className="show-composer"
          title="Write Message"
          aria-label="Write Message"
          onClick={() => {
            flushSync(() => setHide(false))
            foot.current?.querySelector('textarea')?.focus({ preventScroll: true }) // within the tap, so touch keyboards open
          }}
        >
          <SquarePen size={14} />
        </button>
      )}
    </div>
  )
}

function PermissionCard({ agentId, request: r }: { agentId: string; request: Permission }) {
  const daemon = useDaemon()
  const [busy, setBusy] = useState(false)
  const actions: NonNullable<Permission['actions']> = r.actions?.length
    ? r.actions
    : [
        { id: 'deny', label: 'Deny', behavior: 'deny' },
        { id: 'allow', label: 'Allow', behavior: 'allow', variant: 'primary' },
      ]
  const respond = async (a: (typeof actions)[number]) => {
    setBusy(true)
    try {
      await daemon.respondToPermission(agentId, r.id, {
        behavior: a.behavior,
        ...(r.actions?.length ? { selectedActionId: a.id } : {}),
      })
    } catch (e) {
      alert(errorText(e))
      setBusy(false)
    }
  }
  return (
    <div className="permission">
      <div className="permission-title">
        <ShieldQuestion size={15} />
        <span className="grow">{r.title ?? r.name}</span>
      </div>
      {r.description && <div className="muted pre-wrap">{r.description}</div>}
      {r.detail ? (
        <ToolDetailView detail={r.detail} />
      ) : r.input && Object.keys(r.input).length > 0 ? (
        <pre className="term">{JSON.stringify(r.input, null, 2)}</pre>
      ) : null}
      <div className="permission-actions">
        {actions.map((a) => (
          <button
            key={a.id}
            className={`btn ${a.variant === 'primary' ? 'primary' : a.variant === 'danger' ? 'danger' : ''}`}
            disabled={busy}
            onClick={() => void respond(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

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

function Composer({
  agent,
  target,
  onCreated,
  initialText,
  onInitialTextUsed,
  onProjectChange,
  onDraftProvider,
}: {
  agent?: Agent
  target: Target
  onCreated: (a: Agent) => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string) => void
  onDraftProvider?: (provider: string | undefined) => void
}) {
  const daemon = useDaemon()
  const hostId = useHostId()
  const { providers } = useHost()
  const { hosts, projects } = useStore()
  const draftKey = agent ? `${hostId}/${agent.id}` : 'new'
  const [text, setTextState] = useState(() => {
    const d = drafts.get(draftKey) ?? ''
    return d && initialText ? `${d}${/\s$/.test(d) ? '' : ' '}${initialText}` : d || initialText || ''
  })
  const setText = (t: string) => {
    setTextState(t)
    if (t) drafts.set(draftKey, t)
    else drafts.delete(draftKey)
  }
  useEffect(() => {
    if (initialText) {
      drafts.set(draftKey, text)
      onInitialTextUsed?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [images, setImages] = useState<PastedImage[]>([])
  const [files, setFiles] = useState<File[]>([])
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
  // Mount only: a new chat takes focus, and so does the remount after a send creates its agent (focus fell to <body>).
  useEffect(() => {
    const el = input.current
    if (!el || (agent && document.activeElement !== document.body)) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length) // after any inserted selection ref
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
    const prompt = text.trim()
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
      if (agent) {
        await daemon.sendAgentMessage(agent.id, prompt, { images, attachments })
      } else if (provider) {
        const config = {
          provider,
          model: model?.id,
          thinkingOptionId: validThinking,
          modeId: modes.some((m) => m.id === mode) ? (mode ?? undefined) : undefined,
          initialPrompt: prompt,
          images,
          attachments,
        }
        const { workspace } = target
        if (workspace) {
          const created = await daemon.createAgent({ ...config, cwd: workspace.workspaceDirectory, workspaceId: workspace.id })
          onCreated(rememberAgent(hostId, created))
        } else {
          const res = await daemon.createWorkspace({
            source:
              worktree && isGit
                ? // daemon branches off the default branch; an empty name gets a generated one
                  { kind: 'worktree', cwd: target.rootPath, projectId: target.projectId, worktreeSlug: worktreeName.trim() || undefined }
                : { kind: 'directory', path: target.rootPath, projectId: target.projectId },
            agent: { ...config, cwd: target.rootPath },
          })
          if (res.error || !res.agent) throw new Error(res.error ?? 'Workspace was created without an agent')
          onCreated(rememberAgent(hostId, res.agent))
        }
      }
      setText('')
      setImages([])
      setFiles([])
    } catch (e) {
      alert(`Send failed: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
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
        .then((read) => setImages((prev) => [...prev, ...read]))
        .catch((err) => alert(`Image failed: ${errorText(err)}`))
    return picked.length > 0
  }

  const empty = !text.trim() && !images.length && !files.length
  return (
    <div className="composer">
      {ac.popup}
      {images.length + files.length > 0 && (
        <div className="composer-images">
          {images.map((img, i) => (
            <span key={i} className="composer-image">
              <img src={`data:${img.mimeType};base64,${img.data}`} alt={`Pasted image ${i + 1}`} />
              <button title="Remove" aria-label={`Remove Image ${i + 1}`} onClick={() => setImages(images.filter((_, j) => j !== i))}>
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
            options={projects.map((p) => [p.projectId, `${p.projectCustomName || p.projectDisplayName}${hosts.length > 1 ? ` · ${hostLabel(p.hostId)}` : ''}`])}
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

export function Pick({
  ref,
  icon,
  value,
  onChange,
  options,
  title,
}: {
  ref?: Ref<HTMLSelectElement>
  icon?: ReactNode
  value: string | undefined
  onChange: (v: string) => void
  options: [string, string][]
  title: string
}) {
  // Icons overlay the native select (pointer-events: none) so the whole pill opens the picker.
  return (
    <span className="pick" title={title}>
      {icon}
      <select ref={ref} name={title} aria-label={title} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">{title}</option>}
        {options.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </span>
  )
}
