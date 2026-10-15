import type { Workspace } from '../../daemon'

export type Target = { projectId: string; name: string; rootPath: string; workspace?: Workspace }
