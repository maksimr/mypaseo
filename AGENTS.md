# AGENTS.md

### Working rules
1. One task → one feature folder under `src/features/`. Add files freely inside it. Two concurrent agents never get
   tasks in the same folder.
2. Shared files are append-one-block: `App.tsx`, `keymap.ts`, `store.ts`, `daemon.ts`, `git.ts`, `styles/*.css`,
   `index.css`, `.dependency-cruiser.cjs`. Insert inside your feature's existing group; never reorder or reformat. More than one block in shared
   files → do it in a serial step after the parallel work merges.
3. A feature's shortcuts are handled in the feature's component with its own `window` `keydown` listener (as
   Changes, Chat, Sidebar, ReviewThread, Timeline already do). `App.tsx` handles only cross-feature ones (tabs,
   workspaces, panels, palette, settings).
4. Feature CSS lives in the feature's `.css`; `src/index.css` only `@import`s the sheets, in cascade order (never
   import CSS from a component: that reorders the cascade). Shared classes are read-only unless the task is about
   them: `styles/base.css` (`icon-btn`, `row`, `btn`, `input`, `muted`, `faint`, `truncate`, `grow`, `menu`, `empty`,
   `spin`), `styles/modal.css` (`modal-backdrop`), `styles/dialog.css` (`dialog`), plus two that sit in feature sheets
   because moving them would reorder the cascade: `text-btn` (`changes/changes.css`) and `banner`
   (`settings/settings.css`). Follow `doc/action-grid.md` and `doc/action-labels.md`.
5. Run `npm run check` before finishing: `tsc`, `oxlint`, `knip`, `jscpd`, `depcruise`, `scripts/check-case.mjs` and
   the tests. Tests exist only for pure modules; the rest are the real gate. `knip` (`knip.jsonc`) fails on unused files, exports, types and dependencies
   and on circular imports: to share code between a component and its parts, move it to a third module (as
   `settings/section.ts` and `settings/Row.tsx` do), don't import back. `jscpd` (`.jscpd.json`) fails on a copied block
   of 75+ tokens (about 8 lines): import the original or move it to a shared module instead of copying it.
   `depcruise` (`.dependency-cruiser.cjs`) enforces the import rules: a feature imports another only if `FEATURE_DEPS`
   lists it; `src/*.ts` and `src/components/` never import a feature (only `App.tsx` composes them); our CSS loads only
   through `index.css`; `src/` imports no Node built-ins outside tests; `src/` and `paseo-plugin/` never import each other.
6. No two modules in one folder may differ only in case (`review.ts` + `Review.tsx`): on macOS `./Review` resolves
   to `review.ts`. `scripts/check-case.mjs` checks this.

### Feature map
| Feature | Folder | Shared touch points it may need |
|---|---|---|
| Sidebar (projects, workspaces, agents rows, drag order, pin, read/unread, pull/push) | `features/sidebar/` | `store.ts` (actions), `keymap.ts` |
| Hosts (add/remove daemons, host menu) | `features/hosts/` | `store.ts` (`addHost`…), `settings/HostSection.tsx` |
| Chat (timeline, composer, permissions, attachments, usage meter, import session) | `features/chat/` | `store.ts` (`rememberAgent`), `keymap.ts`, `components/Pick` |
| Changes (diff view, staging, commit dialog, discard/restore) | `features/changes/` | `git.ts`, `paseo-plugin/`, `keymap.ts` |
| Review comments (threads, editor, Add Comment, selection refs) | `features/review/` | markup contract below; `Composer` sends them |
| Git graph / file history / commit details | `features/git-graph/` | `git.ts`, `changes/Stat`, `changes.css` row styles |
| Files (tree, file view, open in editor) | `features/files/` | markup contract below |
| Terminals | `features/terminal/` | `keymap.ts` (`appKey` passes app shortcuts through xterm automatically) |
| Settings | `features/settings/` | `keymap.ts` (`SHORTCUT_GROUPS`), `notifications.ts` |
| Command palette | `features/palette/` | `keymap.ts` (`HIDDEN` list) |
| Tabs / panel layout | `features/tabs/` + `App.tsx` | — |
| Update banner (new deploy cached by the service worker in `vite.config.ts`) | `features/update/` | — |
| Artifacts panel (lists the workspace's `artifact`/`mermaid` blocks, a click opens the chat at one; fences, prompt and iframe in `src/artifact.ts`, `components/Artifact`) | `features/artifacts/` | `chat/useTimeline`, `chat/Chat` (`reveal`), `tabs/Panel.tsx`, `App.tsx` |
| Git daemon plugin | `paseo-plugin/` | `git.ts` is its only client (oxlint fails on `invokePluginRpc` anywhere else); its zod schemas are the source of truth for the types |

Shared leaves live in `src/components/` (`ProviderIcon`, `Markdown`, `Code`, `Pick`, `icons`, `menu`); shared modules
stay flat in `src/`.

### New-shortcut checklist
1. `keymap.ts`: add the entry inside its group (not at the end of the object), with that `group`.
2. Handle it with a `window` `keydown` listener in the owning component, gated on `ActiveViewContext` if the view
   stays mounted behind other tabs. The command palette runs shortcuts by dispatching a synthetic `keydown` on
   `window`, so a handler on an element won't be palette-runnable.
3. If it only makes sense inside an input (composer, commit dialog), add it to `HIDDEN` in `CommandPalette.tsx`.
4. Settings → Keymap and Terminal pass-through pick it up automatically.

### Line markup contract (no type or test guards this — change markup and readers together)
| Markup | Rendered by | Read by |
|---|---|---|
| `.code-line > .ln + .lc` | `components/Code.tsx` | `review/selection.ts`, `review/review.ts` |
| `.dl.add\|.remove\|.context > .ln .ln .dc` | `changes/FileHunks.tsx` | `review/selection.ts`, `review/review.ts` |
| `[data-path]` on the file or diff container | `changes/Changes.tsx` (`.excerpt`), `files/Files.tsx` (`.file-view`) | `selection.ts`, `review.ts`, `Changes.tsx` (focus scroll) |
| `.review-thread` between lines | `review/ReviewThread.tsx` | `selection.ts`, `ReviewThread.tsx` (prev/next comment) |
| `.chunk[data-hunk][data-chunk]`, `.staged` | `changes/FileHunks.tsx` | `changes/Changes.tsx` (stage current / go to hunk) |
| `.timeline` inside `.chat-scroll` | `chat/Timeline.tsx`, `chat/Chat.tsx` | `Chat.tsx` (ResizeObserver), `components/Markdown.tsx` (IntersectionObserver root) |
| `.sidebar`, `.panel` | `sidebar/Sidebar.tsx`, `tabs/Panel.tsx` | `swipe.ts` |
| `.selection-action` | `review/SelectionAction.tsx` | itself (hover keep-alive) |
| `.msg[data-item]` (assistant message's timeline index), `iframe[srcdoc]` | `chat/Timeline.tsx`, `components/Artifact.tsx` | `chat/Chat.tsx` (scroll to an artifact) |
| `.row[tabindex]` (`clickable`), current one `.active` or `[aria-current]`, `[aria-expanded]` on the row or its chevron, inside `.sidebar`, `.panel` | sidebar rows, `ProjectRow.tsx` (`aria-current`), `WorkspaceRow.tsx` (chevron), the panel's lists (changes, files, terminal, artifacts, git-graph) | `a11y.ts` (`focusRow`, `navigateRows`: arrow keys) |
| `.view:not([inert])` holding `.chat-foot textarea`, `.term-view textarea` or a `[tabindex="-1"]` scroller (`.changes`, `.graph`, `.file-view`) | `App.tsx`, `chat/Chat.tsx`, `terminal/Terminal.tsx`, `changes/Changes.tsx`, `git-graph/CommitGraph.tsx`, `files/Files.tsx` | `App.tsx` (`focusView` when a side pane closes) |

### CSS ↔ TS constants (keep in sync; the TS comment names the CSS rule)
- `changes/Changes.tsx` `HEADERS = 72` = `.changes-toolbar` 38px + `.excerpt-head` 34px
- `git-graph/CommitGraph.tsx` `ROW = 28` = `.graph-row` height; `LANE = 16`
- `App.tsx` `NARROW = '(width < 900px)'` = the tablet media query in `styles/tablet.css`
- `swipe.ts` `SETTLE_MS = 200` = the settle transition in `styles/tablet.css`

### localStorage keys (`grep localStorage.mypaseo` before adding or renaming one)
| Key | Written by | Read by |
|---|---|---|
| `mypaseoDefaultAgent` | settings/GeneralSection (`DefaultAgent`) | **chat/Composer** (`loadDraft`) |
| `mypaseoDraft` | chat/Composer | **settings/GeneralSection** (fallback) |
| `mypaseoNotifications` | settings/GeneralSection | **notifications.ts** |
| `mypaseoKeymap` | keymap.ts | keymap.ts |
| `mypaseoHosts`, `mypaseoPinned`, `mypaseoProjectOrder` | store.ts | store.ts |
| `mypaseoSelection`, `mypaseoSidebar`, `mypaseoPanel`, `mypaseoActiveOnly`, `mypaseoSidebarWidth`, `mypaseoPanelWidth` | App.tsx | App.tsx |
| `mypaseoCollapsed` | sidebar/Sidebar | same |
| `mypaseoReview` | review/review.ts | same |
| `mypaseoGraphColumns` | git-graph/CommitGraph | same |
| `mypaseoEditor` | files/OpenInEditor | same |
| `mypaseoPaletteHidden` | palette/CommandPalette | same |
| `mypaseoClientId` | daemon.ts | daemon.ts |

Bold = crosses a feature boundary with no import between the files.
