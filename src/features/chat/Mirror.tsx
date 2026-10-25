import { blobOf } from '../rooms/blob'
import { mentionSpans } from '../rooms/mentions'
import { ProfileIcon } from '../rooms/ProfileIcon'

/** The composer's text, drawn under its transparent textarea (composer.css): each mention in its agent's color, its icon
 *  over the @. `looks`: each handle a mention can name, and its color (a CSS color) and icon, if it has them. */
export function Mirror({ text, looks }: { text: string; looks: Map<string, { color?: string; icon?: string }> }) {
  const spans = mentionSpans(text, [...looks.keys()])
  const parts = spans.flatMap(({ handle, start, end }, i) => {
    const { color, icon } = looks.get(handle)!
    return [
      text.slice(spans[i - 1]?.end ?? 0, start),
      <span key={start} style={{ color }}>
        {blobOf(icon) ? (
          <span className="mention-icon">
            @<ProfileIcon icon={icon} color={color} />
          </span>
        ) : (
          '@'
        )}
        {text.slice(start + 1, end)}
      </span>,
    ]
  })
  // The space gives a trailing newline its line, as the textarea does.
  return (
    <div className="composer-mirror" aria-hidden>
      {parts}
      {`${text.slice(spans.at(-1)?.end ?? 0)} `}
    </div>
  )
}
