import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

// sw.js (vite.config.ts `offline`) takes over as soon as a new deploy is cached; this page runs the old build until reloaded.
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onChange = () => setReady(true)
    // The browser checks for a new sw.js only on page load; an installed app can stay open for days.
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}) // offline
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  if (!ready) return null
  return (
    <div className="update-banner" role="status">
      <span className="dot attention" />
      New version available
      <button type="button" className="btn" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="icon-btn" title="Close" onClick={() => setReady(false)}>
        <X size={16} />
      </button>
    </div>
  )
}
