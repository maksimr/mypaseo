// The plugin (rooms-plugin/server/route.ts) has its own copy: keep both passing the Contract's table in doc/multi-agent-chat.md.

/** Blanks fenced code blocks, then inline code spans, so mentions inside code don't count. */
function stripCode(text: string) {
  let fence = ''
  const prose = text
    .split('\n')
    .map((line) => {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (open?.[0] === fence[0] && open.length >= fence.length) fence = ''
        return ''
      }
      if (!open) return line
      fence = open
      return ''
    })
    .join('\n')
  return prose.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, ' ')
}

/**
 * The known handles mentioned in text, unique, in first-seen order. `@` must not follow a letter, digit, `_`, `.`,
 * `/`, `-` or `@` (mail addresses, scoped packages), and the whole `[a-z0-9-]` run after it must be the handle.
 */
export function mentions(text: string, handles: readonly string[]): string[] {
  const found = new Set<string>()
  for (const [, run] of stripCode(text).matchAll(/(?<![\p{L}\p{N}_./@-])@([A-Za-z0-9-]+)/gu)) {
    const handle = run.toLowerCase()
    if (handles.includes(handle)) found.add(handle)
  }
  return [...found]
}
