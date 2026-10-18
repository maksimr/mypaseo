import type { ToolCall } from '../../daemon'

/** The tool's main argument, shown after its name in the header. */
export function toolArg(t: ToolCall): string {
  const d = t.detail
  switch (d.type) {
    case 'shell':
      return d.command
    case 'read':
    case 'edit':
    case 'write':
      return d.filePath
    case 'search':
      return d.query
    case 'fetch':
      return d.url
    case 'sub_agent':
      return d.description ?? d.subAgentType ?? ''
    case 'worktree_setup':
      return d.branchName
    case 'plain_text':
      return d.label ?? ''
    case 'plan':
      return ''
    default: {
      const input = (d.input ?? {}) as Record<string, unknown>
      return String([input.path, input.file_path, input.command, input.pattern, input.query].find((v) => typeof v === 'string') ?? '')
    }
  }
}
