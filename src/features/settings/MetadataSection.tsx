import { useId, useState } from 'react'
import { Options } from '../../components/Options'
import { useHost } from '../../store'
import { metadataKey, metadataOptions, metadataProviders } from './metadata'
import { matches, type SectionProps } from './section'

export function Metadata({ config, patch, q, error }: SectionProps) {
  const { providers } = useHost()
  const [saving, setSaving] = useState(false)
  const id = useId()
  const hint = useId()
  const saved = config.metadataGeneration.providers
  const selected = saved[0]
  const show = matches(q, 'metadata generation model provider commit message pull request pr branch workspace title automatic')
  if (!show && !error) return null

  const save = async (value: string) => {
    setSaving(true)
    try {
      await patch({ metadataGeneration: { providers: metadataProviders(saved, value) } })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section">
      <h2>Metadata</h2>
      {error && <div className="banner err" aria-live="polite">{error}</div>}
      {show && (
        <div className="setting-row">
          <div className="grow">
            <div className="setting-title"><label htmlFor={id}>Generation model</label></div>
            <div className="setting-desc" id={hint}>
              For commit messages, workspace titles, branch names and PR drafts on this host, shared with Paseo desktop.
              Automatic lets Paseo choose a fast model. A selected model is tried first, with fallbacks if unavailable.
            </div>
          </div>
          <div className="setting-control">
            <select
              className="input select"
              id={id}
              name="metadataModel"
              aria-describedby={hint}
              value={selected ? metadataKey(selected) : ''}
              disabled={saving}
              onChange={(e) => void save(e.target.value)}
            >
              <option value="">Automatic</option>
              <Options options={metadataOptions(providers, selected)} />
            </select>
          </div>
        </div>
      )}
    </section>
  )
}
