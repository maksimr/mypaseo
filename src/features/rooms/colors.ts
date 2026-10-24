/** Agent profiles' colors: Paseo desktop's identity color names, each a --identity-* variable in styles/theme.css. */
export const COLORS = ['violet', 'sky', 'emerald', 'orange', 'pink', 'indigo', 'teal', 'red', 'amber', 'blue']

/** A custom color: #rrggbb, as `<input type="color">` gives it. Paseo desktop draws it as none. */
export const isCustom = (color?: string) => !!color && /^#[0-9a-f]{6}$/i.test(color)

/** The CSS color of a profile's color, a name or custom; other values (Paseo desktop's 'none') draw none, as there. */
export const colorVar = (color?: string) => (color && COLORS.includes(color) ? `var(--identity-${color})` : isCustom(color) ? color : undefined)
