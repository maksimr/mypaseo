// The only client of the mypaseo-git daemon plugin. Its zod schemas in paseo-plugin/index.server.ts are the source of
// truth for these types; change both together.
import type { DaemonClient } from './daemon'

const rpc = <T>(daemon: DaemonClient, method: string, input: object) => daemon.invokePluginRpc('mypaseo-git', method, input) as Promise<T>

type Paths = { cwd: string; paths: string[] }

/** HEAD→index diff text per staged file, with -U0 so each hunk is one chunk. */
export const indexDiff = (daemon: DaemonClient, input: { cwd: string }) => rpc<{ files: Record<string, string> }>(daemon, 'index.diff', input)
/** Applies a patch to the index only; `reverse` unstages it. */
export const indexApply = (daemon: DaemonClient, input: { cwd: string; patch: string; reverse?: boolean }) => rpc<object>(daemon, 'index.apply', input)
export const indexAdd = (daemon: DaemonClient, input: Paths) => rpc<object>(daemon, 'index.add', input)
export const indexReset = (daemon: DaemonClient, input: Paths) => rpc<object>(daemon, 'index.reset', input)

/** Commits the index; the daemon's own commit can't amend, sign off or skip hooks. */
export const commit = (daemon: DaemonClient, input: { cwd: string; message: string; amend?: boolean; signoff?: boolean; noVerify?: boolean }) =>
  rpc<object>(daemon, 'commit', input)

export type Commit = { sha: string; parents: string[]; refs: string[]; author: string; date: string; subject: string }
/** Newest `limit` commits of every branch, remote and tag, children before parents; with `path`, HEAD's commits that touch it. */
export const log = (daemon: DaemonClient, input: { cwd: string; limit: number; path?: string }) => rpc<{ commits: Commit[] }>(daemon, 'log', input)

export type CommitInfo = {
  author: string
  email: string
  date: string
  message: string
  files: { path: string; status: string; additions: number; deletions: number }[]
}
/** A commit's author, message and changed files; merges against their first parent. */
export const show = (daemon: DaemonClient, input: { cwd: string; sha: string }) => rpc<CommitInfo>(daemon, 'show', input)
