import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

// sw.js (vite.config.ts `offline`) takes over as soon as a new deploy is cached; this page runs the old build until reloaded.
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onChange = () => setReady(true)
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])
  if (!ready) return null
  return (
    <div className="update-banner" role="status">
      New version available.
      <button type="button" className="btn primary" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="icon-btn" title="Close" onClick={() => setReady(false)}>
        <X size={16} />
      </button>
    </div>
  )
}
