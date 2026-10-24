import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Options } from '../../components/Options'
import { ProviderIcon } from '../../components/ProviderIcon'
import type { AgentProfile, ProviderEntry } from '../../daemon'
import { modelOptions } from '../../modelOptions'
import { setProfiles, useHost, useHostId } from '../../store'
import { COLORS, colorVar, isCustom } from '../rooms/colors'
import { slug } from '../rooms/handles'
import { handleError } from './profiles'
import { matches, type SectionProps } from './section'

const KEYWORDS = 'profiles agents roles mention group chat color'

/** The daemon's agentProfiles: Paseo desktop and agents' list_profiles tool read the same list. */
export function Profiles({ config, patch, q, error }: SectionProps) {
  const hostId = useHostId()
  const { providers } = useHost()
  const profiles = config.agentProfiles ?? []
  // Keyed on content, so other sections' patches don't count as a change.
  const saved = JSON.stringify(profiles)
  useEffect(() => setProfiles(hostId, JSON.parse(saved)), [hostId, saved])
  // The editor closes once the list it was opened on changes: a save that worked. A failed one keeps it open.
  const [open, setOpen] = useState<{ id: string; at: string } | null>(null) // id: a profile's, or 'new'
  const editing = open?.at === saved ? open.id : null
  const setEditing = (id: string | null) => setOpen(id ? { id, at: saved } : null)
  const save = (next: AgentProfile[]) => patch({ agentProfiles: next })
  const remove = (p: AgentProfile) => {
    if (confirm(`Remove profile "${p.name}"? Its settings are lost for good. Agents started from it keep running.`)) void save(profiles.filter((x) => x.id !== p.id))
  }

  const list = profiles.filter((p) => matches(q, KEYWORDS, p.name, p.notes))
  if (!list.length && !matches(q, KEYWORDS) && !error) return null
  return (
    <section className="settings-section">
      <h2>Profiles</h2>
      {error && <div className="banner err">{error}</div>}
      <div className="group-label">Agents to mention in a chat, shared with Paseo desktop</div>
      {list.map((p) => (
        <div key={p.id} className="profile">
          <div className="setting-row">
            <ProviderIcon provider={p.provider} size={18} />
            <div className="grow min0">
              <div className="setting-title">
                {colorVar(p.color) && <span className="profile-dot" style={{ background: colorVar(p.color) }} />}
                {p.name} <span className="muted">@{slug(p.name)}</span>
              </div>
              <div className="setting-desc truncate">{summary(p, providers)}</div>
            </div>
            <button className="icon-btn" title="Edit" aria-label={`Edit Profile ${p.name}`} aria-expanded={editing === p.id} onClick={() => setEditing(editing === p.id ? null : p.id)}>
              <Pencil size={13} />
            </button>
            <button className="icon-btn" title="Remove" aria-label={`Remove Profile ${p.name}`} onClick={() => remove(p)}>
              <Trash2 size={13} />
            </button>
          </div>
          {editing === p.id && (
            <ProfileEditor profile={p} profiles={profiles} onSave={(next) => save(profiles.map((x) => (x.id === next.id ? next : x)))} onCancel={() => setEditing(null)} />
          )}
        </div>
      ))}
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

/** "model · thinking", by their labels. */
function summary(p: AgentProfile, providers: ProviderEntry[]) {
  const models = providers.find((e) => e.provider === p.provider)?.models ?? []
  const model = models.find((m) => m.id === p.model)
  const thinking = (model ?? models.find((m) => m.isDefault))?.thinkingOptions?.find((o) => o.id === p.thinkingOptionId)
  return [model?.label ?? p.model ?? 'Default model', thinking?.label ?? p.thinkingOptionId].filter(Boolean).join(' · ')
}

function ProfileEditor({
  profile,
  profiles,
  onSave,
  onCancel,
}: {
  profile?: AgentProfile
  profiles: AgentProfile[]
  onSave: (p: AgentProfile) => Promise<void>
  onCancel: () => void
}) {
  const { providers } = useHost()
  // A saved provider that isn't ready stays pickable, so editing other fields doesn't change it.
  const usable = providers.filter((p) => (p.enabled && p.status === 'ready') || p.provider === profile?.provider)
  // Keeps the fields Paseo desktop sets and this form doesn't (icon, featureValues).
  const [d, setD] = useState<AgentProfile>(profile ?? { id: '', name: '', provider: usable[0]?.provider ?? '' })
  const set = (patch: Partial<AgentProfile>) => setD({ ...d, ...patch })
  const entry = providers.find((p) => p.provider === d.provider)
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const thinkingOptions = (models.find((m) => m.id === d.model) ?? models.find((m) => m.isDefault) ?? models[0])?.thinkingOptions ?? []
  const modes = entry?.modes ?? []
  const invalid = handleError(d.name, d.id, profiles)
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
          {modes.length > 0 && (
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
