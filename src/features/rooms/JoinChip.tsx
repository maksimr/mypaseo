import { Brain, MessagesSquare, Sparkles, X } from 'lucide-react'
import type { PickOption } from '../../components/Options'
import { Pick } from '../../components/Pick'
import { ProviderIcon } from '../../components/ProviderIcon'

/** An agent the message's mention adds to the chat on send, with its picks. */
export function JoinChip({
  handle,
  provider,
  agent,
  agents,
  onAgent,
  model,
  models,
  thinking,
  thinkingOptions,
  onModel,
  onThinking,
  context,
  contexts,
  onContext,
  onRemove,
}: {
  handle: string
  provider: string | undefined
  agent: string
  agents: PickOption[]
  onAgent: (id: string) => void
  model: string | undefined
  models: PickOption[]
  thinking: string | undefined
  thinkingOptions: PickOption[]
  onModel: (id: string) => void
  onThinking: (id: string) => void
  context: string
  contexts: PickOption[]
  onContext: (id: string) => void
  onRemove: () => void
}) {
  return (
    <span className="join-chip" role="group" aria-label={`@${handle} joins`}>
      {/* Another agent in its place, keeping the Context. */}
      <Pick icon={<ProviderIcon provider={provider} />} value={agent} onChange={onAgent} options={agents} title="Agent" />
      {models.length > 0 && <Pick icon={<Sparkles size={14} />} value={model} onChange={onModel} options={models} title="Model" />}
      {thinkingOptions.length > 0 && <Pick icon={<Brain size={14} />} value={thinking} onChange={onThinking} options={thinkingOptions} title="Thinking" />}
      {/* What of the room it gets with its first message. */}
      <Pick icon={<MessagesSquare size={14} />} value={context} onChange={onContext} options={contexts} title="Context" />
      <button className="icon-btn" title="Remove" aria-label={`Remove @${handle}`} onClick={onRemove}>
        <X size={13} />
      </button>
    </span>
  )
}
