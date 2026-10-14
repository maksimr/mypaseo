// Git index RPCs for mypaseo's diff view and the log for its git graph; the daemon's own API can't stage or list every
// branch. Called from src/components/Changes.tsx and src/components/CommitGraph.tsx.
import { defineRpc } from '@getpaseo/plugin'
import type { PluginServerContext } from '@getpaseo/plugin/server'
import { execFile } from 'node:child_process'
import { z } from 'zod'

const git = (cwd: string, args: string[], input?: string) =>
  new Promise<string>((resolve, reject) => {
    const p = execFile('git', ['--literal-pathspecs', ...args], { cwd, maxBuffer: 64 << 20 }, (err, out, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(out),
    )
    p.stdin?.end(input)
  })

const done = z.object({})
const paths = z.object({ cwd: z.string(), paths: z.array(z.string()).min(1) })

/** HEAD→index diff per staged file, with -U0 so each hunk is one chunk. */
const diff = defineRpc({
  name: 'index.diff',
  input: z.object({ cwd: z.string() }),
  output: z.object({ files: z.record(z.string(), z.string()) }),
})
/** Applies a patch to the index only; `reverse` unstages it. */
const apply = defineRpc({
  name: 'index.apply',
  input: z.object({ cwd: z.string(), patch: z.string(), reverse: z.boolean().optional() }),
  output: done,
})
const add = defineRpc({ name: 'index.add', input: paths, output: done })
/** Commits the index; the daemon's own commit can't amend, sign off or skip hooks. */
const commit = defineRpc({
  name: 'commit',
  input: z.object({
    cwd: z.string(),
    message: z.string(),
    amend: z.boolean().optional(),
    signoff: z.boolean().optional(),
    noVerify: z.boolean().optional(),
  }),
  output: done,
})
const reset = defineRpc({ name: 'index.reset', input: paths, output: done })
/** Newest `limit` commits of every branch, remote and tag, children before parents, for the git graph; with `path`, HEAD's commits that touch it. */
const log = defineRpc({
  name: 'log',
  input: z.object({ cwd: z.string(), limit: z.number().int().positive(), path: z.string().optional() }),
  output: z.object({
    commits: z.array(
      z.object({
        sha: z.string(),
        parents: z.array(z.string()),
        refs: z.array(z.string()), // %D entries: "HEAD -> main", "origin/main", "tag: v1"
        author: z.string(),
        date: z.string(), // ISO 8601
        subject: z.string(),
      }),
    ),
  }),
})
/** A commit's author, message and changed files, diffed like the daemon's getCommitFileDiff: merges against their first parent. */
const show = defineRpc({
  name: 'show',
  input: z.object({ cwd: z.string(), sha: z.string().regex(/^[0-9a-f]{4,64}$/i) }), // never an option like --output
  output: z.object({
    author: z.string(),
    email: z.string(),
    date: z.string(), // ISO 8601
    message: z.string(),
    files: z.array(z.object({ path: z.string(), status: z.string(), additions: z.number(), deletions: z.number() })),
  }),
})

export default function contribute(server: PluginServerContext) {
  server.handle(diff, async ({ cwd }) => {
    const names = (await git(cwd, ['diff', '--cached', '--no-renames', '--name-only', '-z'])).split('\0').filter(Boolean)
    const diffs = names.map((n) => git(cwd, ['diff', '--cached', '--no-renames', '--no-ext-diff', '--no-color', '-U0', '--', n]))
    const texts = await Promise.all(diffs)
    return { files: Object.fromEntries(names.map((n, i) => [n, texts[i]])) }
  })
  server.handle(apply, async ({ cwd, patch, reverse }) => {
    await git(cwd, ['apply', '--cached', ...(reverse ? ['--reverse'] : []), '-'], patch)
    return {}
  })
  server.handle(add, async ({ cwd, paths }) => {
    await git(cwd, ['add', '-A', '--', ...paths])
    return {}
  })
  server.handle(commit, async ({ cwd, message, amend, signoff, noVerify }) => {
    // An amend with an empty message keeps the previous one.
    const msg = amend && !message.trim() ? ['--no-edit'] : ['-F', '-']
    const flags = [amend && '--amend', signoff && '--signoff', noVerify && '--no-verify'].filter((f) => f !== false)
    await git(cwd, ['commit', ...msg, ...flags], message)
    return {}
  })
  server.handle(reset, async ({ cwd, paths }) => {
    const hasHead = await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']).then(
      () => true,
      () => false,
    )
    // Unborn HEAD has nothing to reset to, so drop the paths from the index instead.
    await git(cwd, hasHead ? ['reset', '-q', '--', ...paths] : ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...paths])
    return {}
  })
  server.handle(log, async ({ cwd, limit, path }) => {
    // --parents rewrites %P to the nearest listed ancestors, so a file's graph stays connected.
    const [from, only] = path ? [['--parents'], ['--', path]] : [['--exclude=refs/stash', '--all'], []]
    // \x1e starts a commit, \x1f separates fields; neither shows up in names or subjects.
    const out = await git(cwd, ['log', ...from, '--date-order', `-n${limit}`, '--format=%x1e%H%x1f%P%x1f%D%x1f%an%x1f%aI%x1f%s', ...only])
    const commits = out.split('\x1e').slice(1).map((rec) => {
      const [sha, parents, refs, author, date, subject] = rec.replace(/\n$/, '').split('\x1f')
      return { sha, parents: parents.split(' ').filter(Boolean), refs: refs ? refs.split(', ') : [], author, date, subject }
    })
    return { commits }
  })
  server.handle(show, async ({ cwd, sha }) => {
    const [meta, diff] = await Promise.all([
      git(cwd, ['show', '-s', '--format=%an%x1f%ae%x1f%aI%x1f%B', sha]),
      // No renames: the daemon diffs one path at a time, so a renamed file shows as deleted plus added.
      git(cwd, ['show', '--format=', '--no-renames', '--diff-merges=first-parent', '--raw', '--numstat', '-z', sha]),
    ])
    const [author, email, date, message] = meta.split('\x1f')
    // -z: every raw entry (":old new old new STATUS", path) comes first, then a numstat entry per file in the same order.
    const files: { path: string; status: string; additions: number; deletions: number }[] = []
    const tokens = diff.split('\0')
    let n = 0
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].startsWith(':')) files.push({ status: tokens[i].slice(-1), path: tokens[++i], additions: 0, deletions: 0 })
      else if (tokens[i] && files[n]) {
        const [add, del] = tokens[i].split('\t')
        // Binary files count "-".
        Object.assign(files[n++], { additions: Number(add) || 0, deletions: Number(del) || 0 })
      }
    }
    return { author, email, date, message: message.trim(), files }
  })
  return () => {}
}
