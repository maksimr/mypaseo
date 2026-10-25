// The plugin (rooms-plugin/server/route.ts) has its own copy: keep both passing the Contract's table in doc/multi-agent-chat.md.

const blank = (code: string) => ' '.repeat(code.length)

/** Blanks fenced code blocks, then inline code spans, so mentions inside code don't count; the rest keep their offsets. */
function stripCode(text: string) {
  let fence = ''
  const prose = text
    .split('\n')
    .map((line) => {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (open?.[0] === fence[0] && open.length >= fence.length) fence = ''
        return blank(line)
      }
      if (!open) return line
      fence = open
      return blank(line)
    })
    .join('\n')
  return prose.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, blank)
}

/**
 * Each mention of a known handle in text: the handle, and where its `@handle` starts and ends. `@` must not follow a
 * letter, digit, `_`, `.`, `/`, `-` or `@` (mail addresses, scoped packages), and the whole `[a-z0-9-]` run after it
 * must be the handle.
 */
export function mentionSpans(text: string, handles: readonly string[]) {
  return [...stripCode(text).matchAll(/(?<![\p{L}\p{N}_./@-])@([A-Za-z0-9-]+)/gu)].flatMap(({ 0: at, 1: run, index }) => {
    const handle = run.toLowerCase()
    return handles.includes(handle) ? [{ handle, start: index, end: index + at.length }] : []
  })
}

/** The known handles mentioned in text, unique, in first-seen order. */
export const mentions = (text: string, handles: readonly string[]): string[] => [...new Set(mentionSpans(text, handles).map((m) => m.handle))]
