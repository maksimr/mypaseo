import { ChevronDown, ChevronLeft, Trash2 } from 'lucide-react'
import { Pick } from '../../components/Pick'
import { ProviderIcon } from '../../components/ProviderIcon'
import { placeMenu } from '../../components/menu'
import { ProfileIcon } from '../rooms/ProfileIcon'
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
 *  changes them, and Remove. `joins`: the send adds it to the chat. Its profile's icon, if it has one, in place of its
 *  provider's; `several`, one of several: its color without one. `onBack`: a Back button in its panel's foot, which closes the panel first. */
export function RecipientChip({
  id,
  name,
  provider,
  color,
  icon,
  joins,
  several,
  settings,
  note,
  onRemove,
  onBack,
}: {
  /** Its panel's id. */
  id: string
  name: string
  provider: string | undefined
  /** Its profile's color, a CSS color, and icon. */
  color?: string
  icon?: string
  joins?: boolean
  several: boolean
  settings: Setting[]
  note?: string
  onRemove?: () => void
  onBack?: () => void
}) {
  const brief = briefOf(settings)
  const providerIcon = <ProviderIcon provider={provider} size={13} />
  return (
    <span className="recipient" role="group" aria-label={name}>
      <button className="recipient-chip" popoverTarget={id} onClick={placeMenu(id, true)}>
        <ProfileIcon icon={icon} color={color} size={13} fallback={several ? undefined : providerIcon} />
        <span className="recipient-name">{name}</span>
        {joins && <span className="recipient-tag">joins</span>}
        {brief && <span className="recipient-brief truncate">{brief}</span>}
        <ChevronDown size={12} />
      </button>
      <div id={id} popover="auto" className="menu recipient-panel" role="dialog" aria-label={`${name} Settings`}>
        <div className="recipient-head">
          <ProfileIcon icon={icon} color={color} size={13} fallback={providerIcon} />
          <span className="recipient-name">{name}</span>
          {joins && <span className="recipient-tag">joins</span>}
        </div>
        <SettingList settings={settings} />
        {note && <p className="faint recipient-note">{note}</p>}
        {(onBack || onRemove) && (
          <div className="recipient-foot">
            {onBack && (
              <button
                className="icon-btn"
                title="Back"
                aria-label="Back to Recipients"
                onClick={() => {
                  document.getElementById(id)!.hidePopover()
                  onBack()
                }}
              >
                <ChevronLeft size={15} />
              </button>
            )}
            {onRemove && (
              <button className="btn danger recipient-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
        )}
      </div>
    </span>
  )
}
