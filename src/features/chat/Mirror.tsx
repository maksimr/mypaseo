import { mentionSpans } from '../rooms/mentions'

/** The composer's text, drawn under its transparent textarea (composer.css): each mention in its agent's color. `colors`:
 *  each handle a mention can name, and its color (a CSS color), if it has one. */
export function Mirror({ text, colors }: { text: string; colors: Map<string, string | undefined> }) {
  const spans = mentionSpans(text, [...colors.keys()])
  const parts = spans.flatMap(({ handle, start, end }, i) => [
    text.slice(spans[i - 1]?.end ?? 0, start),
    <span key={start} style={{ color: colors.get(handle) }}>
      {text.slice(start, end)}
    </span>,
  ])
  // The space gives a trailing newline its line, as the textarea does.
  return (
    <div className="composer-mirror" aria-hidden>
      {parts}
      {`${text.slice(spans.at(-1)?.end ?? 0)} `}
    </div>
  )
}
