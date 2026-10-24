/** Agent profiles' colors: Paseo desktop's identity color names, each a --identity-* variable in styles/theme.css. */
export const COLORS = ['violet', 'sky', 'emerald', 'orange', 'pink', 'indigo', 'teal', 'red', 'amber', 'blue']

/** The CSS color of a color name; unknown names (and Paseo desktop's 'none') draw none, as in Paseo desktop. */
export const colorVar = (name?: string) => (name && COLORS.includes(name) ? `var(--identity-${name})` : undefined)
