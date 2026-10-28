import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Agent } from '../../daemon'
import { useHost } from '../../store'
import { parentIn } from './parent'

/** In a subagent's tab, in place of its provider's icon: back to the agent or subagent that started it. */
export function BackToParent({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      className="tab-back"
      title="Back to Parent"
      aria-label={`Back to ${label}`}
      onClick={(e) => {
        e.stopPropagation() // not a click on the tab
        onBack()
      }}
    >
      <ArrowLeft size={13} />
    </button>
  )
}

/** A chat tab's icon (`children`); a Paseo subagent's, back to its parent's chat. */
export function ChatTabIcon({ agent, onOpenAgent, children }: { agent: Agent | undefined; onOpenAgent: (a: Agent) => void; children: ReactNode }) {
  const { agents } = useHost()
  const parent = agent && parentIn(agent, agents)
  return parent ? <BackToParent label={parent.title || 'Agent'} onBack={() => onOpenAgent(parent)} /> : children
}
