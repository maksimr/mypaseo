# AGENTS.md

### Working rules
1. One task → one feature folder under `src/features/`. Add files freely inside it. Two concurrent agents never get
   tasks in the same folder.
2. Shared files are append-one-block: `App.tsx`, `keymap.ts`, `store.ts`, `daemon.ts`, `git.ts`, `rooms.ts`, `styles/*.css`,
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
   through `index.css`; `src/` imports no Node built-ins outside tests; `src/` and the daemon plugins (`paseo-plugin/`,
   `rooms-plugin/`) never import each other.
6. No two modules in one folder may differ only in case (`review.ts` + `Review.tsx`): on macOS `./Review` resolves
   to `review.ts`. `scripts/check-case.mjs` checks this.

### Feature map
| Feature | Folder | Shared touch points it may need |
|---|---|---|
| Sidebar (projects, workspaces, agents rows, drag order, pin, read/unread, pull/push; a room's members nest under its lead, `roomTree.ts`) | `features/sidebar/` | `store.ts` (actions), `keymap.ts`, `rooms/members` |
| Hosts (add/remove daemons, host menu) | `features/hosts/` | `store.ts` (`addHost`…), `settings/HostSection.tsx` |
| Chat (timeline, composer, permissions, attachments, usage meter, import session; the composer's recipient chips (`Recipients`: one line, one's chip, several behind one "N agents" chip whose menu lists them; `RecipientChip`: each recipient's Model, Thinking, Mode and, for a joining agent, Shared history; built in `session.ts`, the only place they're set besides a member's settings in the Context card, `MemberSettings`, which reuses them); a lead's chat is its room view: `@` mentions, Direct Message lock, Share From Here; the Context card floating over a chat: Open in Editor, a room's members, one's settings) | `features/chat/` | `store.ts` (`rememberAgent`, `profiles`), `keymap.ts` (`shareFromHere`), `components/Pick`, `rooms.ts`, `features/rooms/`, `files/OpenInEditor` |
| Changes (diff view, staging, commit dialog, discard/restore) | `features/changes/` | `git.ts`, `paseo-plugin/`, `keymap.ts` |
| Review comments (threads, editor, Add Comment, selection refs) | `features/review/` | markup contract below; `Composer` sends them |
| Git graph / file history / commit details | `features/git-graph/` | `git.ts`, `changes/Stat`, `changes.css` row styles |
| Files (tree, file view, open in editor) | `features/files/` | markup contract below |
| Terminals | `features/terminal/` | `keymap.ts` (`appKey` passes app shortcuts through xterm automatically) |
| Settings (incl. Profiles: the default agent, `defaultAgent.ts`, then the daemon's `agentProfiles`) | `features/settings/` | `keymap.ts` (`SHORTCUT_GROUPS`), `notifications.ts`, `store.ts` (`setProfiles`), `daemon.ts` (`AgentProfile`), `defaultAgent.ts`, `rooms/handles` |
| Command palette | `features/palette/` | `keymap.ts` (`HIDDEN` list) |
| Tabs / panel layout (a room's members hide behind its lead's tab; closing a lead closes the room; a subagent has a tab only while open, and closing it goes back to its parent; a provider subagent's tab, `sub:`) | `features/tabs/` + `App.tsx` | `rooms/members`, `chat/ContextCard` (`ContextToggle`), `subagents/parent`, `subagents/SubagentView` |
| Update banner (new deploy cached by the service worker in `vite.config.ts`) | `features/update/` | — |
| List search (`/` in the sidebar, file panel or an open menu: type to jump to a matching row) | `features/list-search/` | `keymap.ts` (`listSearch`), markup contract below; the git graph sends `/` to its own search box |
| Artifacts panel (lists the workspace's `artifact`/`mermaid` blocks, a click opens the chat at one; fences, prompt and iframe in `src/artifact.ts`, `components/Artifact`) | `features/artifacts/` | `chat/useTimeline`, `chat/Chat` (`reveal`), `tabs/Panel.tsx`, `App.tsx` |
| Git daemon plugin | `paseo-plugin/` | `git.ts` is its only client (oxlint fails on `invokePluginRpc` anywhere but `git.ts` and `rooms.ts`); its zod schemas are the source of truth for the types |
| Subagents: the track at the bottom of an agent's chat, as Paseo desktop's (the Paseo agents it started, labelled `paseo.parent-agent-id`, and its provider's own: Claude Code's Task tool, Codex's, pi's); a provider subagent's read-only tab (`SubagentView`); a subagent tab's back to its parent, in place of its provider's icon (`TabBack`); parents (`parent.ts`: Paseo subagents nest under their parent's sidebar row and leave the tab bar) | `features/subagents/` | `chat/Timeline` (`children`), `chat/useTimeline`, `chat/work` (`act`), `chat/Chat` (`track`), `App.tsx`; `FEATURE_DEPS` lets sidebar and tabs import it |
| Group chats (rooms): handles, profile colors (`colors.ts`), mention parser, membership labels, room view merge (`mergeRoom`), `MemberList` (in the chat's Context card, `chat/ContextCard`). Design and Contract: `doc/multi-agent-chat.md` | `features/rooms/` | `rooms.ts`, `store.ts` (`profiles`); `FEATURE_DEPS` lets chat, settings, sidebar and tabs import it, `App.tsx` too |
| Rooms daemon plugin `mypaseo-rooms` (routes room posts into members' sessions, digests, loop guard, room log) | `rooms-plugin/` | `rooms.ts` is its only client, as `git.ts` is for `paseo-plugin/`; its zod schemas in `index.server.ts` are the source of truth for the types. Modules sit in `server/` (the daemon's plugin build refuses others); `server/route.ts` copies the mention parser of `rooms/mentions.ts`: keep both passing the Contract's table |

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
| Sticky header `[data-path] > .excerpt-head\|.file-path`, scroller `[tabindex="-1"]` around it | `changes/Changes.tsx`, `files/Files.tsx` | `review/SelectionAction.tsx` (keeps the button in the visible part) |
| `.review-thread` between lines | `review/ReviewThread.tsx` | `selection.ts`, `ReviewThread.tsx` (prev/next comment) |
| `.chunk[data-hunk][data-chunk]`, `.staged` | `changes/FileHunks.tsx` | `changes/Changes.tsx` (stage current / go to hunk) |
| `.timeline` and `.chat-foot` inside `.chat-scroll` | `chat/Timeline.tsx`, `chat/Chat.tsx`, `subagents/SubagentView.tsx` | `Chat.tsx` (ResizeObserver), `components/Markdown.tsx` (IntersectionObserver root) |
| `.sidebar`, `.panel` | `sidebar/Sidebar.tsx`, `tabs/Panel.tsx` | `swipe.ts` |
| `[data-swipe]` on a row that swipes to show its actions (`.swipe-actions`) | `sidebar/WorkspaceRow.tsx` (`sidebar/rowSwipe.ts`) | `swipe.ts` (starts no pane drag on it) |
| `.selection-action` | `review/SelectionAction.tsx` | itself (hover keep-alive) |
| `[data-item]` (its timeline index; in a room view, its index in the merged room, `mergeRoom`) on each timeline item's root (a `details.work` run of tool calls and thoughts carries its first item's, and holds theirs; in a room, a member's run of items sits in a `.msg-run` under its sticky `.msg-author`), `iframe[srcdoc]` | `chat/Timeline.tsx`, `chat/WorkGroup.tsx`, `components/Artifact.tsx` | `chat/Chat.tsx` (scroll to an artifact), `chat/reading.ts` (`itemAcross`, `.timeline > [data-item], .msg-run > [data-item]`: the item across the reading line, for Share From Here) |
| `.row[tabindex]` (`clickable`), current one `.active` or `[aria-current]`, `[aria-expanded]` on the row or its chevron, inside `.sidebar`, `.panel` | sidebar rows, `ProjectRow.tsx` (`aria-current`), `WorkspaceRow.tsx` (chevron), the panel's lists (changes, files, terminal, artifacts, git-graph) | `a11y.ts` (`focusRow`, `navigateRows`: arrow keys) |
| Searchable items `.row[tabindex]` and `.menu > button` (menus `.menu[popover]`), each labelled by its first `.truncate` (else all its text); the box sits over `.sidebar > .tree`, `.panel > .panel-tabs + *` | sidebar rows, the panel's lists, `menu`s (`WorkspaceRow`, `ProjectRow`, `Hosts`, `Files` crumbs, `CommitDialog`, `OpenInEditor`) | `list-search/ListSearch.tsx` |
| `.view:not([inert])` holding `.chat-foot textarea`, `.term-view textarea` or a `[tabindex="-1"]` scroller (`.changes`, `.graph`, `.file-view`, a subagent's `.chat-scroll`) | `App.tsx`, `chat/Chat.tsx`, `terminal/Terminal.tsx`, `changes/Changes.tsx`, `git-graph/CommitGraph.tsx`, `files/Files.tsx`, `subagents/SubagentView.tsx` | `focus.ts` (`focusView`: a side pane closes, or Move Focus lands in the main area) |
| Columns `.sidebar`, `.center`, `.panel`; their content `.sidebar > .tree`, `.panel > .panel-tabs + *`, `.view:not([inert])` | `sidebar/Sidebar.tsx`, `App.tsx`, `tabs/Panel.tsx` | `focus.ts` (`moveFocus`: Ctrl+Alt+arrows) |
| `[role="toolbar"]` bars (`.sidebar-head`, `.sidebar-foot`, `.tabbar`, `.panel-tabs`, `.changes-toolbar`, `.graph-toolbar`, `.file-path`, `.context-card`), open tab `.tab.on`, `.panel-tab.on`, menus `.menu` skipped | `sidebar/Sidebar.tsx`, `tabs/TabBar.tsx`, `tabs/Panel.tsx`, `changes/Changes.tsx`, `git-graph/CommitGraph.tsx`, `files/Files.tsx`, `chat/ContextCard.tsx` | `a11y.ts` (`navigateBars`: left/right, `focusBar`), `focus.ts` (`moveFocus`) |

### CSS ↔ TS constants (keep in sync; the TS comment names the CSS rule)
- `changes/Changes.tsx` `HEADERS = 72` = `.changes-toolbar` 38px + `.excerpt-head` 34px
- `git-graph/CommitGraph.tsx` `ROW = 28` = `.graph-row` height; `LANE = 16`
- `App.tsx` `NARROW = '(width < 900px)'` = the tablet media query in `styles/tablet.css`
- `components/menu.ts` `PHONE = '(width < 600px)'` = the phone media query in `styles/tablet.css` (`.menu::backdrop` scrim)
- `swipe.ts` `SETTLE_MS = 200` = the settle transition in `styles/tablet.css`
- `sidebar/rowSwipe.ts` `SETTLE_MS = 200` = the `.row.swiped` transition in `sidebar/sidebar.css`
- `git-graph/CommitGraph.tsx` `LANES = 7` = `--lane-0` … `--lane-6` in `styles/theme.css`
- `rooms/colors.ts` `COLORS` = `--identity-*` in `styles/theme.css` (Paseo desktop's identity color names)

### Colors and themes
Every color is a `--` variable in `styles/theme.css`, as `light-dark(light, dark)` (one value if both themes share it);
feature CSS and TS use only `var(--…)`. `color-scheme` picks the side: the system's, or the theme `theme.ts` writes to
`<meta name="color-scheme">`. TS reads a color with `cssColor('name')` and again when `useDark()` changes (`Terminal.tsx`).

### localStorage keys (`grep localStorage.mypaseo` before adding or renaming one)
| Key | Written by | Read by |
|---|---|---|
| `mypaseoDefaultAgent` | defaultAgent.ts (`saveDefaultAgent`, from settings/ProfilesSection) | defaultAgent.ts (chat/Composer `loadDraft`, chat/Chat) |
| `mypaseoDraft` | chat/Composer | **settings/ProfilesSection** (fallback) |
| `mypaseoNotifications` | settings/GeneralSection | **notifications.ts** |
| `mypaseoKeymap` | keymap.ts | keymap.ts |
| `mypaseoHosts`, `mypaseoPinned`, `mypaseoProjectOrder` | store.ts | store.ts |
| `mypaseoSelection`, `mypaseoSidebar`, `mypaseoPanel`, `mypaseoPanelTab`, `mypaseoActiveOnly`, `mypaseoSidebarWidth`, `mypaseoPanelWidth` | App.tsx | App.tsx |
| `mypaseoCollapsed` | sidebar/Sidebar | same |
| `mypaseoReview` | review/review.ts | same |
| `mypaseoGraphColumns` | git-graph/CommitGraph | same |
| `mypaseoEditor` | files/OpenInEditor | same |
| `mypaseoPaletteHidden` | palette/CommandPalette | same |
| `mypaseoContext` | chat/ContextCard | same |
| `mypaseoClientId` | daemon.ts | daemon.ts |
| `mypaseoTheme` | theme.ts (`setTheme`, from settings/GeneralSection) | **index.html** (inline script), theme.ts |

Bold = crosses a feature boundary with no import between the files.
