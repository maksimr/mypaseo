import type { PickOption } from '../../components/Options'
import type { Agent, DaemonClient, ProviderEntry } from '../../daemon'
import { modelOptions } from '../../modelOptions'

/** One of a recipient's settings; `brief` ones show on its chip and on its Context card row. */
export type Setting = { title: string; value: string | undefined; options: PickOption[]; onChange: (v: string) => void; brief?: boolean }
/** The settings a recipient's session has. */
export type Session = 'model' | 'thinking' | 'mode'

/** The provider's selectable models, the picked one (else its default) and a thinking level it offers (else its default). */
export function modelConfig(entry: ProviderEntry | undefined, modelId: string | null | undefined, thinking: string | null | undefined) {
  const models = (entry?.models ?? []).filter((m) => m.isSelectable !== false)
  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.isDefault) ?? models[0]
  const thinkingOptions = model?.thinkingOptions ?? []
  const validThinking = (thinkingOptions.some((o) => o.id === thinking) ? thinking : model?.defaultThinkingOptionId) ?? undefined
  return { models, model, thinkingOptions, validThinking }
}

export const sessionSettings = (
  c: ReturnType<typeof modelConfig>,
  set: (field: Session, value: string) => void,
  modes: { id: string; label: string }[],
  mode: string | null | undefined,
): Setting[] => [
  ...(c.models.length ? [{ title: 'Model', value: c.model?.id, options: modelOptions(c.models), onChange: (v: string) => set('model', v), brief: true }] : []),
  ...(c.thinkingOptions.length
    ? [{ title: 'Thinking', value: c.validThinking, options: c.thinkingOptions.map((o): PickOption => [o.id, o.label]), onChange: (v: string) => set('thinking', v), brief: true }]
    : []),
  ...(modes.length ? [{ title: 'Mode', value: mode ?? undefined, options: modes.map((m): PickOption => [m.id, m.label]), onChange: (v: string) => set('mode', v) }] : []),
]

/** A running agent's settings: what its session runs, or `picked` over it. */
export const agentSettings = (entry: ProviderEntry | undefined, a: Agent, set: (field: Session, value: string) => void, picked: Partial<Record<Session, string>> = {}) =>
  sessionSettings(
    modelConfig(entry, picked.model ?? a.runtimeInfo?.model ?? a.model, picked.thinking ?? a.thinkingOptionId ?? a.effectiveThinkingOptionId),
    set,
    a.availableModes,
    picked.mode ?? a.currentModeId,
  )

/** Changes one of a running agent's settings in its session. */
export const sendSetting = (daemon: DaemonClient, a: Agent, field: Session, value: string) =>
  field === 'model' ? daemon.setAgentModel(a.id, value) : field === 'thinking' ? daemon.setAgentThinkingOption(a.id, value) : daemon.setAgentMode(a.id, value)

/** Its `brief` settings' values, e.g. "Opus 4.5 · High". */
export const briefOf = (settings: Setting[]) =>
  settings
    .filter((s) => s.brief)
    .map((s) => s.options.find(([v]) => v === s.value)?.[1] ?? s.value)
    .filter(Boolean)
    .join(' · ')
