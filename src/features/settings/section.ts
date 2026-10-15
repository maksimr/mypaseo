// Shared by the Settings shell and its sections, apart from both so neither imports the other back.
import type { DaemonClient, DaemonConfig } from '../../daemon'

export const GENERAL_GROUPS = ['Agents', 'Notifications'] as const
export const anchor = (...parts: string[]) => `settings-${parts.join('-')}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
export type Patch = Parameters<DaemonClient['patchDaemonConfig']>[0]
export type SectionProps = { config: DaemonConfig; patch: (p: Patch) => Promise<void>; q: string }
export const matches = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q))
