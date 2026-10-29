import type { PickOption } from '../../components/Options'
import type { DaemonConfig, ProviderEntry } from '../../daemon'

type MetadataProvider = DaemonConfig['metadataGeneration']['providers'][number]

// A tuple keeps providers and model ids containing slashes distinct.
export const metadataKey = (p: MetadataProvider) => JSON.stringify([p.provider, p.model ?? ''])

export function metadataOptions(providers: ProviderEntry[], selected?: MetadataProvider): PickOption[] {
  const options: PickOption[] = []
  for (const p of providers) {
    if (!p.enabled || p.status !== 'ready') continue
    const group = p.label ?? p.provider
    options.push([metadataKey({ provider: p.provider }), `${group} default`, group])
    for (const m of p.models ?? []) {
      if (m.isSelectable !== false) options.push([metadataKey({ provider: p.provider, model: m.id }), m.label, group])
    }
  }
  // Don't disguise a saved model as Automatic while its provider is unavailable or refreshing.
  if (selected && !options.some(([key]) => key === metadataKey(selected))) {
    options.unshift([metadataKey(selected), `${selected.provider} · ${selected.model ?? 'Provider default'} · unavailable`])
  }
  return options
}

/** Change only the preferred model; Automatic clears the configured chain, as in Paseo desktop. */
export function metadataProviders(saved: MetadataProvider[], value: string): MetadataProvider[] {
  if (!value) return []
  if (saved[0] && metadataKey(saved[0]) === value) return saved
  const [provider, model] = JSON.parse(value) as [string, string]
  return [{ provider, ...(model ? { model } : {}) }, ...saved.slice(1)]
}
