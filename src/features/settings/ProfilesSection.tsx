import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Options } from '../../components/Options'
import type { AgentProfile, ProviderEntry } from '../../daemon'
import { saveDefaultAgent, useDefaultAgent, type DefaultAgent } from '../../defaultAgent'
import { modelOptions } from '../../modelOptions'
import { setProfiles, useHost, useHostId } from '../../store'
import { COLORS, colorVar, isCustom } from '../rooms/colors'
import { slug } from '../rooms/handles'
import { ProfileIcon } from '../rooms/ProfileIcon'
import { IconPicker } from './IconPicker'
import { handleError } from './profiles'
import { matches, type SectionProps } from './section'

const KEYWORDS = 'profiles agents roles mention group chat color icon'
const DEFAULT_KEYWORDS = 'default provider model thinking new agent'
/** The default agent's row, as `open`'s id. */
const DEFAULT = 'default'

/** The default agent (`defaultAgent.ts`), then the daemon's agentProfiles: Paseo desktop and agents' list_profiles tool
 *  read the same list. */
export function Profiles({ config, patch, q, error }: SectionProps) {
  const hostId = useHostId()
  const { providers } = useHost()
  const profiles = config.agentProfiles ?? []
  // Keyed on content, so other sections' patches don't count as a change.
  const saved = JSON.stringify(profiles)
  useEffect(() => setProfiles(hostId, JSON.parse(saved)), [hostId, saved])
  // The editor closes once the list it was opened on changes: a save that worked. A failed one keeps it open.
  const [open, setOpen] = useState<{ id: string; at: string } | null>(null) // id: a profile's, 'new' or DEFAULT
  const editing = open?.at === saved ? open.id : null
  const setEditing = (id: string | null) => setOpen(id ? { id, at: saved } : null)
  const save = (next: AgentProfile[]) => patch({ agentProfiles: next })
  const remove = (p: AgentProfile) => {
    if (confirm(`Remove profile "${p.name}"? Its settings are lost for good. Agents started from it keep running.`)) void save(profiles.filter((x) => x.id !== p.id))
  }

  // Until one is saved, a new agent starts with the composer's last picks (chat/Composer.tsx): show those.
  const def: DefaultAgent = useDefaultAgent() ?? JSON.parse(localStorage.mypaseoDraft ?? '{}')
  // The default agent as a profile, for its row and editor.
  const defProfile: AgentProfile = {
    id: DEFAULT,
    name: 'agent',
    provider: def.provider ?? providers.find((p) => p.enabled && p.status === 'ready')?.provider ?? '',
    model: def.model,
    thinkingOptionId: def.thinking,
    color: def.color,
    icon: def.icon,
  }
  const toggle = (id: string) => () => setEditing(editing === id ? null : id)

  const showDefault = matches(q, KEYWORDS, DEFAULT_KEYWORDS)
  const list = profiles.filter((p) => matches(q, KEYWORDS, p.name, p.notes))
  if (!list.length && !showDefault && !error) return null
  return (
    <section className="settings-section">
      <h2>
        Profiles {profiles.length > 0 && <span className="profile-count">{profiles.length}</span>}
      </h2>
      {error && <div className="banner err">{error}</div>}
      <div className="profile-list">
        {showDefault && (
          <>
            <div className="group-label">Default for new agents, @agent in a chat, stored in this browser</div>
            <ProfileRow p={defProfile} label="Default Agent" open={editing === DEFAULT} onEdit={toggle(DEFAULT)}>
              <ProfileEditor
                profile={defProfile}
                profiles={profiles}
                isDefault
                onSave={async ({ provider, model, thinkingOptionId: thinking, color, icon }) => {
                  saveDefaultAgent({ provider, model, thinking, color, icon })
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            </ProfileRow>
          </>
        )}
        <div className="group-label">Agents to mention in a chat, shared with Paseo desktop</div>
        {list.map((p) => (
          <ProfileRow key={p.id} p={p} label={`Profile ${p.name}`} open={editing === p.id} onEdit={toggle(p.id)} onRemove={() => remove(p)}>
            <ProfileEditor profile={p} profiles={profiles} onSave={(next) => save(profiles.map((x) => (x.id === next.id ? next : x)))} onCancel={() => setEditing(null)} />
          </ProfileRow>
        ))}
      </div>
      {!profiles.length && <div className="setting-desc profile-empty">No profiles yet.</div>}
      {editing === 'new' ? (
        <ProfileEditor profiles={profiles} onSave={(next) => save([...profiles, next])} onCancel={() => setEditing(null)} />
      ) : (
        <button className="btn ghost" onClick={() => setEditing('new')}>
          <Plus size={13} /> Add Profile
        </button>
      )}
    </section>
  )
}

/** A profile at a glance: its icon, handle, model and thinking, then Edit, which opens its editor (`children`) under
 *  it, and Remove. `label`: what the buttons' aria-labels name. */
function ProfileRow({ p, label, open, onEdit, onRemove, children }: { p: AgentProfile; label: string; open: boolean; onEdit: () => void; onRemove?: () => void; children: ReactNode }) {
  const { providers } = useHost()
  const { model, thinking } = labels(p, providers)
  return (
    <div className="profile">
      <ProfileIcon icon={p.icon} color={colorVar(p.color)} size={18} fallback={<span className="profile-dot" style={{ background: colorVar(p.color) }} />} />
      <span className="profile-handle truncate" title={p.name}>
        @{slug(p.name)}
      </span>
      <span className="muted truncate">{model}</span>
      {thinking ? <span className="profile-thinking">{thinking}</span> : <span />}
      <button className="icon-btn" title="Edit" aria-label={`Edit ${label}`} aria-expanded={open} onClick={onEdit}>
        <Pencil size={14} />
      </button>
      {onRemove ? (
        <button className="icon-btn" title="Remove" aria-label={`Remove ${label}`} onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      ) : (
        <span />
      )}
      {open && children}
    </div>
  )
}

/** The labels of the model and thinking a profile starts with: its own, else the defaults. */
function labels(p: AgentProfile, providers: ProviderEntry[]) {
  const entry = providers.find((e) => e.provider === p.provider)
  const models = entry?.models ?? []
  const model = p.model ? models.find((m) => m.id === p.model) : models.find((m) => m.isDefault)
  const options = model?.thinkingOptions ?? []
  const thinking = options.find((o) => o.id === (p.thinkingOptionId ?? model?.defaultThinkingOptionId)) ?? (p.thinkingOptionId ? undefined : options.find((o) => o.isDefault))
  return { model: model?.label ?? p.model ?? entry?.label ?? p.provider, thinking: thinking?.label ?? p.thinkingOptionId }
}

/** `isDefault`: the default agent's, which has no name, mode or role. */
function ProfileEditor({
  profile,
  profiles,
  isDefault,
  onSave,
  onCancel,
}: {
  profile?: AgentProfile
  profiles: AgentProfile[]
  isDefault?: boolean
  onSave: (p: AgentProfile) => Promise<void>
  onCancel: () => void
}) {
  const { providers } = useHost()
  // A saved provider that isn't ready stays pickable, so editing other fields doesn't change it.
  const usable = providers.filter((p) => (p.enabled && p.status === 'ready') || p.provider === profile?.provider)
  // Keeps the fields Paseo desktop sets and this form doesn't (its icon keys, featureValues).
  const [d, setD] = useState<AgentProfile>(profile ?? { id: '', name: '', provider: usable[0]?.provider ?? '' })
  const set = (patch: Partial<AgentProfile>) => setD({ ...d, ...patch })
  const entry = providers.find((p) => p.provider === d.provider)
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const thinkingOptions = (models.find((m) => m.id === d.model) ?? models.find((m) => m.isDefault) ?? models[0])?.thinkingOptions ?? []
  const modes = entry?.modes ?? []
  const invalid = isDefault ? null : handleError(d.name, d.id, profiles)
  const shown = d.name ? invalid : null
  const hint = useId()
  const colorLabel = useId()
  return (
    <form
      className="profile-editor"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ ...d, id: d.id || crypto.randomUUID(), name: d.name.trim(), notes: d.notes?.trim() || undefined })
      }}
    >
      {!isDefault && (
        <div className="field">
          <label>
            <div className="field-label">Name</div>
            <input
              className="input"
              name="profileName"
              autoFocus
              placeholder="Code reviewer"
              aria-describedby={hint}
              aria-invalid={!!shown}
              value={d.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <div id={hint} className={`field-hint ${shown ? 'err' : 'muted'}`}>
            {shown ?? `Mention it as @${slug(d.name) || 'name'}.`}
          </div>
        </div>
      )}
      <div className="field">
        <div className="field-label">Agent</div>
        <div className="setting-selects">
          <select
            className="input select"
            aria-label="Provider"
            value={d.provider}
            // Model, thinking, mode and features belong to the provider.
            onChange={(e) => set({ provider: e.target.value, model: undefined, thinkingOptionId: undefined, modeId: undefined, featureValues: undefined })}
          >
            <Options options={usable.map((p) => [p.provider, p.label ?? p.provider])} />
          </select>
          {models.length > 0 && (
            <select className="input select" aria-label="Model" value={d.model ?? ''} onChange={(e) => set({ model: e.target.value || undefined, thinkingOptionId: undefined })}>
              <option value="">Provider default</option>
              <Options options={modelOptions(models)} />
            </select>
          )}
          {thinkingOptions.length > 0 && (
            <select className="input select" aria-label="Thinking" value={d.thinkingOptionId ?? ''} onChange={(e) => set({ thinkingOptionId: e.target.value || undefined })}>
              <option value="">Model default</option>
              <Options options={thinkingOptions.map((o) => [o.id, o.label])} />
            </select>
          )}
          {!isDefault && modes.length > 0 && (
            <select className="input select" aria-label="Mode" value={d.modeId ?? ''} onChange={(e) => set({ modeId: e.target.value || undefined })}>
              <option value="">Provider default</option>
              <Options options={modes.map((m) => [m.id, m.label])} />
            </select>
          )}
        </div>
      </div>
      <div className="field">
        <div id={colorLabel} className="field-label">
          Color
        </div>
        <div className="profile-colors">
          <div role="radiogroup" aria-labelledby={colorLabel}>
            {['', ...COLORS].map((c) => {
              const label = c ? c[0].toUpperCase() + c.slice(1) : 'No Color'
              return (
                <input
                  key={c}
                  type="radio"
                  name="profileColor"
                  className={c ? undefined : 'no-color'}
                  title={label}
                  aria-label={label}
                  style={c ? { background: colorVar(c) } : undefined}
                  checked={c ? d.color === c : !colorVar(d.color)}
                  onChange={() => set({ color: c || undefined })}
                />
              )
            })}
          </div>
          {/* A click picks the custom color shown, then the picker changes it. */}
          <input
            type="color"
            className={isCustom(d.color) ? 'custom on' : 'custom'}
            title="Custom Color"
            aria-label="Custom Color"
            value={isCustom(d.color) ? d.color : '#808080'}
            onClick={(e) => set({ color: e.currentTarget.value })}
            onChange={(e) => set({ color: e.target.value })}
          />
        </div>
      </div>
      <IconPicker icon={d.icon} color={colorVar(d.color)} onChange={(icon) => set({ icon })} />
      {!isDefault && (
        <label className="field">
          <div className="field-label">Role in group chats</div>
          <textarea
            className="input"
            name="profileNotes"
            rows={3}
            placeholder="What this agent does when others mention it, e.g. reviews diffs and never edits files."
            value={d.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      )}
      <div className="profile-actions">
        <button className="btn primary" type="submit" disabled={!!invalid || !d.provider}>
          Save
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
