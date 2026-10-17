import { Maximize2, Shapes } from 'lucide-react'
import { useMemo } from 'react'
import { clickable } from '../../a11y'
import { artifactDocs } from '../../artifact'
import type { Agent } from '../../daemon'
import { byRecent, useStore } from '../../store'
import { useTimeline } from '../chat/useTimeline'

/** The panel's Artifacts section: what the workspace's agents rendered in chat, newest agent and artifact first. */
export function Artifacts({
  workspaceId,
  onOpen,
  onOpenTab,
}: {
  workspaceId: string
  onOpen: (agent: Agent, doc: string) => void
  onOpenTab: (doc: string, title: string) => void
}) {
  const agents = useStore().agents.filter((a) => a.workspaceId === workspaceId).sort(byRecent)
  return (
    <div className="artifacts">
      {agents.map((a) => (
        <AgentArtifacts key={a.id} agent={a} onOpen={(doc) => onOpen(a, doc)} onOpenTab={onOpenTab} />
      ))}
    </div>
  )
}

/** An artifact's own tab: the page at the view's full size. */
export function ArtifactView({ doc }: { doc: string }) {
  return <iframe className="artifact-view" title="Artifact" sandbox="allow-scripts" srcDoc={doc} />
}

function AgentArtifacts({ agent, onOpen, onOpenTab }: { agent: Agent; onOpen: (doc: string) => void; onOpenTab: (doc: string, title: string) => void }) {
  const { items } = useTimeline(agent.id)
  // Each artifact is described by the user message it answers.
  const blocks = useMemo(() => {
    let prompt = ''
    return items
      .flatMap((i) => {
        if (i.type === 'user_message') prompt = i.text
        return i.type === 'assistant_message' ? artifactDocs(i.text).map((doc) => ({ doc, prompt: prompt || 'Artifact' })) : []
      })
      .reverse()
  }, [items])
  if (!blocks.length) return null
  return (
    <section>
      <div className="artifacts-agent faint truncate">{agent.title || 'Agent'}</div>
      {blocks.map((b, i) => (
        <div key={i} className="row" title={b.prompt} {...clickable(() => onOpen(b.doc))}>
          <Shapes size={14} className="muted" />
          <span className="truncate grow">{b.prompt}</span>
          <button
            className="icon-btn hover-only"
            title="Open in Tab"
            onClick={(e) => {
              e.stopPropagation()
              onOpenTab(b.doc, b.prompt)
            }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      ))}
    </section>
  )
}
