import { ArrowUp, FolderClosed, Import, Loader2, ShieldQuestion, Square } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { daemon, errorText, type Agent, type Permission, type Workspace } from '../daemon'
import { rememberAgent, useStore } from '../store'
import { useTimeline } from '../useTimeline'
import { Timeline, ToolDetailView } from './Timeline'

export type Target = { projectId: string; name: string; rootPath: string; workspace?: Workspace }

export function Chat({
  agent,
  target,
  onCreated,
  onImport,
}: {
  agent: Agent | undefined
  target: Target
  onCreated: (agent: Agent) => void
  onImport: () => void
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
            {tl.hasOlder && (
              <button className="load-older" onClick={() => void tl.loadOlder()}>
                Load earlier messages
              </button>
            )}
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
              <Import size={13} /> Import an existing session…
            </button>
          </div>
        )}
      </div>
      {agent?.pendingPermissions.map((p) => <PermissionCard key={p.id} agentId={agent.id} request={p} />)}
      <Composer agent={agent} target={target} onCreated={onCreated} />
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

function Composer({ agent, target, onCreated }: { agent?: Agent; target: Target; onCreated: (a: Agent) => void }) {
  const { providers } = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
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
    if (!prompt || busy) return
    setBusy(true)
    try {
      if (agent) {
        await daemon.sendAgentMessage(agent.id, prompt)
      } else if (provider) {
        const config = {
          provider,
          model: model?.id,
          thinkingOptionId: validThinking,
          modeId: modes.some((m) => m.id === mode) ? (mode ?? undefined) : undefined,
          initialPrompt: prompt,
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
    } catch (e) {
      alert(`Send failed: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const ws = target.workspace
  const branch = ws?.project?.checkout?.currentBranch
  return (
    <div className="composer">
      <textarea
        name="prompt"
        value={text}
        placeholder={agent ? 'Message the agent…' : provider ? 'What should the agent do?' : 'No ready providers — check Settings'}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
      />
      <div className="composer-bar">
        <span className="crumb truncate">
          <FolderClosed size={13} />
          {target.name}
          {(branch || ws) && <span className="muted"> / {branch ?? ws?.title ?? ws?.name}</span>}
        </span>
        <span className="grow" />
        {!agent && (
          <Pick value={provider} onChange={(v) => change('provider', v)} options={usable.map((p) => [p.provider, p.label ?? p.provider])} title="Provider" />
        )}
        {modes.length > 0 && <Pick value={mode ?? undefined} onChange={(v) => change('mode', v)} options={modes.map((m) => [m.id, m.label])} title="Mode" />}
        {thinkingOptions.length > 0 && (
          <Pick value={validThinking} onChange={(v) => change('thinking', v)} options={thinkingOptions.map((o) => [o.id, o.label])} title="Thinking" />
        )}
        {models.length > 0 && <Pick value={model?.id} onChange={(v) => change('model', v)} options={models.map((m) => [m.id, m.label])} title="Model" />}
        {agent?.status === 'running' && !text.trim() ? (
          <button className="send stop" title="Stop" onClick={() => void daemon.cancelAgent(agent.id)}>
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button className="send" title="Send (Enter)" disabled={!text.trim() || busy || !provider} onClick={() => void send()}>
            {busy ? <Loader2 size={14} className="spin" /> : <ArrowUp size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

function Pick({
  value,
  onChange,
  options,
  title,
}: {
  value: string | undefined
  onChange: (v: string) => void
  options: [string, string][]
  title: string
}) {
  return (
    <select className="pick" name={title} title={title} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {value === undefined && <option value="">{title}</option>}
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  )
}
