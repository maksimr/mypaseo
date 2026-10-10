// Git index RPCs for mypaseo's diff view; the daemon's own API can't stage. Called from src/components/Changes.tsx.
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
  return () => {}
}
