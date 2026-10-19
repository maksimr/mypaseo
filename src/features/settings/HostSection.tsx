import { Fragment, useState } from 'react'
import { errorText } from '../../daemon'
import { toWsUrl } from '../hosts/hostUrl'
import { hostEndpoint, hostLabel, removeHost, updateHost, useHost, useHostId, useStore } from '../../store'
import { Row } from './Row'
import { matches } from './section'

/** Saved in this browser, so it renders while the host is offline: that's when its address needs fixing. */
export function HostSection({ q }: { q: string }) {
  const id = useHostId()
  const { hosts } = useStore()
  const { status, error, hostname } = useHost()
  const host = hosts.find((h) => h.id === id)!
  const [urlError, setUrlError] = useState<string | null>(null)
  const addressError = urlError ?? error
  const rows = [
    matches(q, 'host name label') && (
      <Row key="name" title="Name" description="Shown in the host list and next to its projects.">
        <input
          className="input"
          name="hostLabel"
          aria-label="Host name"
          defaultValue={host.label}
          placeholder={hostname ?? hostEndpoint(host)}
          onBlur={(e) => e.target.value.trim() !== (host.label ?? '') && updateHost(id, { label: e.target.value.trim() || undefined })}
        />
      </Row>
    ),
    matches(q, 'host daemon address url connection') && (
      <Fragment key="url">
        <Row title="Address" description={status === 'connected' ? 'Connected' : status}>
          <input
            className="input mono"
            name="hostUrl"
            aria-label="Host address"
            defaultValue={host.url}
            spellCheck={false}
            onBlur={(e) => {
              try {
                const url = toWsUrl(e.target.value)
                setUrlError(null)
                e.target.value = url
                if (url !== host.url) updateHost(id, { url })
              } catch (err) {
                setUrlError(errorText(err))
              }
            }}
          />
        </Row>
        {addressError && <div className="banner err">{addressError}</div>}
      </Fragment>
    ),
    matches(q, 'host password') && (
      <Row key="password" title="Password" description="Set on the host with paseo daemon set-password. Stored in this browser.">
        <input
          className="input"
          type="password"
          name="hostPassword"
          aria-label="Host password"
          autoComplete="off"
          placeholder="None"
          defaultValue={host.password}
          onBlur={(e) => e.target.value !== (host.password ?? '') && updateHost(id, { password: e.target.value || undefined })}
        />
      </Row>
    ),
    matches(q, 'remove host') && (
      <Row key="remove" title="Remove Host" description={hosts.length > 1 ? 'Stop connecting to it from this browser. The daemon and its agents keep running.' : "The only host can't be removed."}>
        <button
          className="btn danger"
          disabled={hosts.length < 2}
          onClick={() => confirm(`Remove host "${hostLabel(id)}"? Its daemon keeps running.`) && removeHost(id)}
        >
          Remove
        </button>
      </Row>
    ),
  ].filter(Boolean)
  if (!rows.length) return null
  return (
    <section className="settings-section">
      <h2>Host</h2>
      {rows}
    </section>
  )
}
