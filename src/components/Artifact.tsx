import { Maximize2 } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { OpenArtifactContext } from '../openArtifact'

/** An agent-made page (artifact.ts). Its scripts run with an opaque origin: no access to the app's DOM or storage.
 * `children`: buttons before Open in Tab (Markdown passes its Copy, which this module can't import back). */
export function Artifact({ doc, children }: { doc: string; children?: React.ReactNode }) {
  const open = useContext(OpenArtifactContext)
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && typeof e.data?.artifactHeight === 'number') setHeight(e.data.artifactHeight)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return (
    <div className="artifact">
      <iframe ref={ref} title="Artifact" sandbox="allow-scripts" srcDoc={doc} style={{ height }} />
      <div className="artifact-actions">
        {children}
        <button className="icon-btn" title="Open in Tab" onClick={() => open(doc)}>
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}
