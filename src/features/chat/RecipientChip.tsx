import { ChevronDown, X } from 'lucide-react'
import { Pick } from '../../components/Pick'
import { ProviderIcon } from '../../components/ProviderIcon'
import { placeMenu } from '../../components/menu'
import { briefOf, type Setting } from './session'

/** A recipient's settings, a labelled pick each: in its chip's panel, and in the Context card's member view (MemberSettings). */
export function SettingList({ settings }: { settings: Setting[] }) {
  return settings.map((s) => (
    <label key={s.title} className="recipient-setting">
      <span className="muted">{s.title}</span>
      <Pick value={s.value} onChange={s.onChange} options={s.options} title={s.title} />
    </label>
  ))
}

/** An agent the message goes to: a chip with its settings at a glance that opens all of them, where the composer
 *  changes them. `joins`: the send adds it to the chat. */
export function RecipientChip({
  id,
  name,
  provider,
  joins,
  settings,
  note,
  onRemove,
}: {
  /** Its panel's id. */
  id: string
  name: string
  provider: string | undefined
  joins?: boolean
  settings: Setting[]
  note?: string
  onRemove?: () => void
}) {
  const brief = briefOf(settings)
  return (
    <span className="recipient" role="group" aria-label={name}>
      <button className="recipient-chip" popoverTarget={id} onClick={placeMenu(id, true)}>
        <ProviderIcon provider={provider} size={13} />
        <span className="recipient-name">{name}</span>
        {joins && <span className="recipient-tag">joins</span>}
        {brief && <span className="recipient-brief truncate">{brief}</span>}
        <ChevronDown size={12} />
      </button>
      {onRemove && (
        <button className="icon-btn" title="Remove" aria-label={`Remove ${name}`} onClick={onRemove}>
          <X size={13} />
        </button>
      )}
      <div id={id} popover="auto" className="menu recipient-panel" role="dialog" aria-label={`${name} Settings`}>
        <div className="recipient-head">
          <ProviderIcon provider={provider} size={13} />
          <span className="recipient-name">{name}</span>
          {joins && <span className="recipient-tag">joins</span>}
        </div>
        <SettingList settings={settings} />
        {note && <p className="faint recipient-note">{note}</p>}
      </div>
    </span>
  )
}
