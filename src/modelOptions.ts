import type { PickOption } from './components/Options'

// Pi and OpenCode address a model as `upstream/model`: group those by the upstream provider (anthropic, openrouter…).
export const modelOptions = (models: { id: string; label: string }[]): PickOption[] =>
  models.map((m) => [m.id, m.label, m.id.includes('/') ? m.id.split('/')[0] : undefined])
