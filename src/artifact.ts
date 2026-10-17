// Artifacts: fenced blocks the chat renders as a live page in a sandboxed iframe instead of as code.

/** Appended to every new agent's system prompt (Composer), so it knows the fences below render. */
export const ARTIFACT_PROMPT = `This chat renders two kinds of fenced code blocks in your replies live instead of as code:
- \`\`\`mermaid: a Mermaid diagram.
- \`\`\`artifact: a complete, self-contained HTML document (<!doctype html>, inline CSS and JS, libraries only from a CDN such as https://cdn.jsdelivr.net), shown in a sandboxed iframe sized to its content height. It defaults to a dark color scheme and has no localStorage, cookies, alert() or form submission.
Use them when a diagram, chart or small interactive page explains something better than text.`

// Dark defaults like the app unless the page sets its own (:where has no specificity); reports the page's height so
// the iframe fits it. Appended, as anything before the page's doctype would put it in quirks mode.
const SHELL = `<style>:where(:root){color-scheme:dark}</style><script>new ResizeObserver(() => parent.postMessage({ artifactHeight: document.documentElement.offsetHeight }, '*')).observe(document.documentElement)</script>`

/** The iframe document for a fenced block, or undefined when its language isn't an artifact. */
export function artifactDoc(lang: string, code: string) {
  if (lang === 'artifact') return code + SHELL
  if (lang === 'mermaid')
    return `<!doctype html><pre class="mermaid">${code.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre><script type="module">import m from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'; m.initialize({ startOnLoad: false, theme: 'dark' }); await m.run()</script>${SHELL}`
}

/** A message's closed artifact blocks, in order. Unlike Markdown, sees only fences outside lists and quotes. */
export const artifactDocs = (text: string) =>
  [...text.matchAll(/^ {0,3}((`|~)\2{2,})(?!\2)([\w+-]*).*\n([\s\S]*?)^ {0,3}\1\2*[ \t]*$/gm)].flatMap((m) => artifactDoc(m[3], m[4]) ?? [])

/** A tab label for an iframe document: the page's <title>, else "Artifact". */
export const artifactTitle = (doc: string) => /<title>([^<]*)<\/title>/i.exec(doc)?.[1].trim() || 'Artifact'

/** Whether a fenced block's source, from its opening fence to where the block ends, has its closing fence yet. */
export const fenceClosed = (source: string) => /^[ \t]*((`|~)\2{2,})(?!\2)[\s\S]*\n[ \t]*\1\2*[ \t]*$/.test(source)
