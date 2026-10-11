import { ArrowUp, Bot, Brain, ChevronDown, Folder, Import, Loader2, Plus, Shield, ShieldQuestion, Sparkles, Square, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { daemon, errorText, type Agent, type Permission, type Workspace } from '../daemon'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { rememberAgent, useStore } from '../store'
import { useAutocomplete } from '../useAutocomplete'
import { useTimeline } from '../useTimeline'
import { Timeline, ToolDetailView } from './Timeline'

export type Target = { projectId: string; name: string; rootPath: string; workspace?: Workspace }

export function Chat({
  agent,
  target,
  onCreated,
  onImport,
  initialText,
  onInitialTextUsed,
  onProjectChange,
}: {
  agent: Agent | undefined
  target: Target
  onCreated: (agent: Agent) => void
  onImport: () => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string, text: string) => void
}) {
  const tl = useTimeline(agent?.id ?? null)
  const running = agent?.status === 'running'
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  // Stick to the bottom while streaming unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [tl.items, agent?.pendingPermissions.length])
  // Viewing an agent acknowledges its "finished" / "error" attention flag.
  useEffect(() => {
    if (agent?.requiresAttention && !agent.pendingPermissions.length) void daemon.clearAgentAttention(agent.id).catch(() => {})
  }, [agent?.id, agent?.requiresAttention, agent?.pendingPermissions.length])

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {agent ? (
          <>
            {tl.loading && <div className="empty">Loading…</div>}
            {tl.error && <div className="empty err">{tl.error}</div>}
            <Timeline items={tl.items} running={running} />
            {agent.lastError && agent.status === 'error' && <div className="msg error pre-wrap">{agent.lastError}</div>}
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
      <Composer
        agent={agent}
        target={target}
        onCreated={onCreated}
        initialText={initialText}
        onInitialTextUsed={onInitialTextUsed}
        onProjectChange={onProjectChange}
      />
    </div>
  )
}

function PermissionCard({ agentId, request: r }: { agentId: string; request: Permission }) {
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
const loadDraft = (): Draft => JSON.parse(localStorage.mypaseoDraft ?? '{}')

type PastedImage = { data: string; mimeType: string }
const readImage = (file: File) =>
  new Promise<PastedImage>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ mimeType: file.type, data: (r.result as string).split(',')[1] })
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

function Composer({
  agent,
  target,
  onCreated,
  initialText,
  onInitialTextUsed,
  onProjectChange,
}: {
  agent?: Agent
  target: Target
  onCreated: (a: Agent) => void
  initialText?: string
  onInitialTextUsed?: () => void
  onProjectChange: (projectId: string, text: string) => void
}) {
  const { providers, projects } = useStore()
  const [text, setText] = useState(initialText ?? '')
  useEffect(() => {
    if (initialText) onInitialTextUsed?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [images, setImages] = useState<PastedImage[]>([])
  const [busy, setBusy] = useState(false)
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
    if ((!prompt && !images.length) || busy) return
    setBusy(true)
    try {
      if (agent) {
        await daemon.sendAgentMessage(agent.id, prompt, { images })
      } else if (provider) {
        const config = {
          provider,
          model: model?.id,
          thinkingOptionId: validThinking,
          modeId: modes.some((m) => m.id === mode) ? (mode ?? undefined) : undefined,
          initialPrompt: prompt,
          images,
        }
        const { workspace } = target
        if (workspace) {
          const created = await daemon.createAgent({ ...config, cwd: workspace.workspaceDirectory, workspaceId: workspace.id })
          rememberAgent(created)
          onCreated(created)
        } else {
          const res = await daemon.createWorkspace({
            source: { kind: 'directory', path: target.rootPath, projectId: target.projectId },
            agent: { ...config, cwd: target.rootPath },
          })
          if (res.error || !res.agent) throw new Error(res.error ?? 'Workspace was created without an agent')
          rememberAgent(res.agent)
          onCreated(res.agent)
        }
      }
      setText('')
      setImages([])
    } catch (e) {
      alert(`Send failed: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // Returns whether any images were found, so paste can fall back to text.
  const addImages = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (imgs.length)
      Promise.all(imgs.map(readImage))
        .then((read) => setImages((prev) => [...prev, ...read]))
        .catch((err) => alert(`Image failed: ${errorText(err)}`))
    return imgs.length > 0
  }

  const empty = !text.trim() && !images.length
  return (
    <div className="composer">
      {ac.popup}
      {images.length > 0 && (
        <div className="composer-images">
          {images.map((img, i) => (
            <span key={i} className="composer-image">
              <img src={`data:${img.mimeType};base64,${img.data}`} alt={`Pasted image ${i + 1}`} />
              <button title="Remove" aria-label={`Remove Image ${i + 1}`} onClick={() => setImages(images.filter((_, j) => j !== i))}>
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
          if (addImages([...e.clipboardData.files])) e.preventDefault()
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
        <button className="icon-btn composer-add" title="Attach Image" onClick={() => fileInput.current?.click()}>
          <Plus size={16} />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addImages([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {!agent && (
          <Pick
            ref={projectSelect}
            icon={<Folder size={14} />}
            value={target.projectId}
            // The chat remounts for the new project: hand it the typed text.
            onChange={(id) => onProjectChange(id, text)}
            options={projects.map((p) => [p.projectId, p.projectCustomName || p.projectDisplayName])}
            title="Project"
          />
        )}
        {!agent && (
          <Pick
            icon={<Bot size={14} />}
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

function Pick({
  ref,
  icon,
  value,
  onChange,
  options,
  title,
}: {
  ref?: Ref<HTMLSelectElement>
  icon: ReactNode
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
