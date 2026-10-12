# Action grid

Every icon action in the app sits on the same grid:

- Icon: 13px (`size={13}`), the same size as the status marks (loader, unread dot).
- Button: `icon-btn`, 18×18px hit area.
- Spacing: adjacent actions touch, so their centers are 18px apart.
- Edge: the last action's glyph sits in the 13px status-mark slot at the row's right edge, so actions and marks line up in one column across rows. Where a row has a mark, actions replace it on hover (`hover-swap`).

Touch: with a coarse pointer the hit area grows to 26px on the same grid; with no hover, the selected row and expanded
projects always show their actions, beside the mark.

Inside a `.row`, `.row .icon-btn` in `src/index.css` already applies this grid. Don't override button size, margins or gaps in components; pass `size={13}` to the icon and let the CSS place it.
