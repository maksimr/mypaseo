import { useSyncExternalStore } from 'react'

const isMac = navigator.userAgent.includes('Mac')
const mod = isMac ? 'Meta' : 'Ctrl'

/** Settings lists shortcuts under these headings, in this order. */
const GROUPS = ['General', 'Tabs', 'Workspaces', 'Chat', 'Git'] as const
type Shortcut = { group: (typeof GROUPS)[number]; label: string; description: string; default: string }

/** Remappable shortcuts. A combo is modifiers in Ctrl, Alt, Shift, Meta order plus a KeyboardEvent.code, e.g. "Meta+KeyB". */
export const SHORTCUTS = {
  // General
  commandPalette: { group: 'General', label: 'Command Palette', description: 'Search and run a command.', default: `${mod}+KeyK` },
  // Ctrl on Mac too: Safari keeps ⌘, and ⇧⌘, for itself and never passes them to the page.
  openSettings: { group: 'General', label: 'Open Settings', description: 'Open this settings window.', default: 'Ctrl+Comma' },
  toggleSidebar: { group: 'General', label: 'Toggle Sidebar', description: 'Show or hide the project sidebar.', default: `${mod}+KeyB` },
  togglePanel: { group: 'General', label: 'Toggle Secondary Sidebar', description: 'Show or hide the right panel with files and changes.', default: `${mod}+KeyE` },
  // VS Code's Explorer binding. Shift sorts before Meta in a combo.
  openFiles: { group: 'General', label: 'Open Files', description: 'Show the file tree in the secondary sidebar and move the focus there.', default: isMac ? 'Shift+Meta+KeyE' : 'Ctrl+Shift+KeyE' },
  // A for Artifacts, like Open Files. Chrome's Search Tabs on the same keys isn't reserved, so the page gets them first.
  openArtifacts: { group: 'General', label: 'Open Artifacts', description: 'Show the artifacts of the current workspace in the secondary sidebar and move the focus there.', default: isMac ? 'Shift+Meta+KeyA' : 'Ctrl+Shift+KeyA' },
  // Ctrl on Mac too: Chrome there keeps Cmd+Alt+Left/Right for switching browser tabs.
  focusLeft: { group: 'General', label: 'Move Focus Left', description: 'Move the focus from the file panel to the main area, or from the main area to the sidebar. Hidden panes are skipped.', default: 'Ctrl+Alt+ArrowLeft' },
  focusRight: { group: 'General', label: 'Move Focus Right', description: 'Move the focus from the sidebar to the main area, or from the main area to the file panel. Hidden panes are skipped.', default: 'Ctrl+Alt+ArrowRight' },
  focusUp: { group: 'General', label: 'Move Focus Up', description: 'Move the focus up within the sidebar, main area or file panel: from the content to the toolbar or tabs above it. There Left and Right go through the controls.', default: 'Ctrl+Alt+ArrowUp' },
  focusDown: { group: 'General', label: 'Move Focus Down', description: 'Move the focus down within the sidebar, main area or file panel: from the tabs or a toolbar to what is below it.', default: 'Ctrl+Alt+ArrowDown' },
  addProject: { group: 'General', label: 'Add Project', description: 'Add a project directory to the sidebar.', default: 'Ctrl+KeyO' },
  // Vim's and less's search key. A bare key: it acts only with the focus on a list, never in a text field.
  listSearch: { group: 'General', label: 'Search in List', description: 'In the sidebar, the file panel, an open menu or the git graph, type to jump to a matching row. Up and Down go through the matches, Enter opens the current one, Escape stops on it.', default: 'Slash' },

  // Tabs
  nextTab: { group: 'Tabs', label: 'Next Tab', description: 'Go to the next tab of the current workspace: agents, terminals, changes, git graph, open files.', default: 'Ctrl+Shift+BracketRight' },
  prevTab: { group: 'Tabs', label: 'Previous Tab', description: 'Go to the previous tab of the current workspace.', default: 'Ctrl+Shift+BracketLeft' },
  // Ctrl on Mac too: ⌘W closes the browser tab. Off Mac, Chrome keeps Ctrl+W for itself outside an installed app window.
  // Id kept as closeAgent so saved rebindings still apply.
  closeAgent: { group: 'Tabs', label: 'Close Tab', description: 'Close the open tab. On a chat tab, archive its agent.', default: 'Ctrl+KeyW' },
  // Ctrl on Mac too, as asked. Off Mac, Chrome keeps Ctrl+Shift+N (incognito) outside an installed app window.
  newAgent: { group: 'Tabs', label: 'New Agent', description: 'Open the new agent composer in the selected workspace.', default: 'Ctrl+Shift+KeyN' },
  // Paseo desktop's binding, Ctrl on Mac too: browsers keep ⌘⇧T (reopen tab). Off Mac, Chrome keeps Ctrl+Shift+T outside an installed app window.
  newTerminal: { group: 'Tabs', label: 'New Terminal', description: 'Open a terminal in the selected workspace.', default: 'Ctrl+Shift+KeyT' },

  // Workspaces
  // Browsers keep ⌘N / Ctrl+N (new window) for themselves.
  newWorkspace: { group: 'Workspaces', label: 'New Workspace', description: 'Start a new workspace in the current project.', default: isMac ? 'Ctrl+KeyN' : 'Alt+KeyN' },
  newScratch: { group: 'Workspaces', label: 'New Scratch', description: 'Start a workspace in a fresh folder, outside your projects.', default: `${mod}+Semicolon` },
  nextWorkspace: { group: 'Workspaces', label: 'Next Workspace', description: 'Go to the workspace below in the sidebar.', default: 'Ctrl+BracketRight' },
  prevWorkspace: { group: 'Workspaces', label: 'Previous Workspace', description: 'Go to the workspace above in the sidebar.', default: 'Ctrl+BracketLeft' },
  // Mac: Mail's Archive. Elsewhere Alt, like New Workspace.
  archiveWorkspace: { group: 'Workspaces', label: 'Archive Workspace', description: 'Archive the selected workspace.', default: isMac ? 'Ctrl+Meta+KeyA' : 'Alt+KeyA' },
  removeWorkspace: { group: 'Workspaces', label: 'Remove Workspace', description: 'Delete the agents of the selected workspace, then archive it.', default: isMac ? 'Ctrl+Meta+Backspace' : 'Alt+Delete' },
  // Like Archive Workspace; Alt+P is taken by Choose Model.
  togglePin: { group: 'Workspaces', label: 'Pin or Unpin Workspace', description: 'Pin the selected workspace, or unpin it when pinned. Pinned workspaces stay listed when the sidebar shows only active ones.', default: isMac ? 'Ctrl+Meta+KeyP' : 'Alt+Shift+KeyP' },
  // Mac: Mail's Mark as Read/Unread. Elsewhere Alt, like Archive Workspace.
  toggleRead: { group: 'Workspaces', label: 'Mark Read or Unread', description: 'Mark the open agent read, or unread when it is read. With no agent open, the selected workspace.', default: isMac ? 'Shift+Meta+KeyU' : 'Alt+KeyU' },
  toggleActiveOnly: { group: 'Workspaces', label: 'Show Only Active Workspaces', description: 'Filter the sidebar and workspace navigation to running and unread workspaces.', default: 'Ctrl+KeyU' },

  // Chat
  // Shift+Enter still inserts a newline since combos match exactly.
  send: { group: 'Chat', label: 'Send', description: 'Send the message in the chat composer.', default: 'Enter' },
  cycleThinking: { group: 'Chat', label: 'Cycle Thinking Level', description: 'Switch to the next thinking level from the chat composer.', default: 'Shift+Tab' },
  pickModel: { group: 'Chat', label: 'Choose Model', description: 'Open the model picker from the chat composer.', default: 'Alt+KeyP' },
  // Ctrl on Mac too, as asked: ⌘P is the browser's Print.
  pickProject: { group: 'Chat', label: 'Choose Project', description: 'Open the project picker from the new agent composer.', default: 'Ctrl+KeyP' },
  // Ctrl+" (Shift+Quote on US layout), Ctrl on Mac too.
  expandTools: { group: 'Chat', label: 'Expand Tool Output', description: 'Expand or collapse the output of every tool call in the chat.', default: 'Ctrl+Shift+Quote' },
  jumpToLatest: { group: 'Chat', label: 'Jump to Latest Message', description: 'Scroll the chat to its newest message.', default: 'Ctrl+End' },
  // Ctrl on Mac too, as asked. On Mac it shares ⌃L with Add Selection to Chat below, which acts only on a selection.
  focusComposer: { group: 'Chat', label: 'Focus Composer', description: 'Move the focus to the chat composer, showing it if scrolling hid it.', default: 'Ctrl+KeyL' },
  // Browsers keep ⌘L / Ctrl+L (address bar) for themselves.
  addToChat: { group: 'Chat', label: 'Add Selection to Chat', description: 'Insert the selected lines of a file or diff into the chat composer as path:start-end.', default: isMac ? 'Ctrl+KeyL' : 'Alt+KeyL' },
  // Alt like Choose Model. Shift added to it ends the range, so bind it without Shift.
  shareFromHere: { group: 'Chat', label: 'Share From Here', description: 'In a group chat, share the room from the message across the middle of the chat with the agents your message adds, or add the default agent. With Shift, or a Shift-click on the Share From Here button of a message, end the shared range at that message.', default: 'Alt+KeyS' },

  // Git
  // VS Code's Source Control binding; H for history.
  openChanges: { group: 'Git', label: 'Open Changes', description: 'Open the uncommitted changes of the current workspace.', default: 'Ctrl+Shift+KeyG' },
  openGraph: { group: 'Git', label: 'Open Git Graph', description: 'Open the commit graph of the current workspace.', default: 'Ctrl+Shift+KeyH' },
  prevHunk: { group: 'Git', label: 'Go to Previous Hunk', description: 'Scroll the diff view to the previous change.', default: 'Alt+Shift+ArrowUp' },
  nextHunk: { group: 'Git', label: 'Go to Next Hunk', description: 'Scroll the diff view to the next change.', default: 'Alt+Shift+ArrowDown' },
  // VS Code's binding.
  prevComment: { group: 'Git', label: 'Go to Previous Comment', description: 'Scroll the diff or file view to the previous review comment.', default: 'Alt+Shift+F9' },
  nextComment: { group: 'Git', label: 'Go to Next Comment', description: 'Scroll the diff or file view to the next review comment.', default: 'Alt+F9' },
  stageAll: { group: 'Git', label: 'Stage All', description: 'Stage every change from the diff view.', default: isMac ? 'Ctrl+Meta+KeyY' : 'Alt+KeyY' },
  commit: { group: 'Git', label: 'Commit', description: 'Open the commit dialog from the diff view, then commit the staged changes.', default: `${mod}+Enter` },
  // Zed's binding. Shift sorts before Meta in a combo.
  amend: { group: 'Git', label: 'Amend Commit', description: 'Amend the last commit from the commit dialog. An empty message keeps its message.', default: isMac ? 'Shift+Meta+Enter' : 'Ctrl+Shift+Enter' },
  pull: { group: 'Git', label: 'Pull', description: 'Pull the selected workspace from its remote.', default: 'Ctrl+Shift+KeyP' },
  push: { group: 'Git', label: 'Push', description: 'Push the selected workspace to its remote.', default: 'Ctrl+Shift+KeyK' },
} satisfies Record<string, Shortcut>
export type ShortcutId = keyof typeof SHORTCUTS
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[]
export const SHORTCUT_GROUPS: [string, ShortcutId[]][] = GROUPS.map((g) => [g, SHORTCUT_IDS.filter((id) => SHORTCUTS[id].group === g)])

type Keys = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
// Physical key (code), not key: Cmd+B must still match on a Cyrillic layout, and Alt+B on Mac types "∫".
export const comboOf = (e: Keys) =>
  [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.code].filter(Boolean).join('+')

/** The keys a combo stands for; comboOf(keysOf(c)) === c. */
export function keysOf(combo: string): Keys {
  const mods = combo.split('+')
  const code = mods.pop()!
  return { code, ctrlKey: mods.includes('Ctrl'), altKey: mods.includes('Alt'), shiftKey: mods.includes('Shift'), metaKey: mods.includes('Meta') }
}

const SYMBOLS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘', Backspace: '⌫' }
const PUNCTUATION: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}
/** "Meta+KeyB" → "⌘B" on Mac, "Meta+B" elsewhere. */
export function formatCombo(combo: string, mac = isMac) {
  const parts = combo.split('+').map((p) => PUNCTUATION[p] ?? p.replace(/^(Key|Digit)/, ''))
  return mac ? parts.map((p) => SYMBOLS[p] ?? p).join('') : parts.join('+')
}

const KEY = 'mypaseoKeymap'
let overrides: Partial<Record<ShortcutId, string>> = JSON.parse(localStorage[KEY] ?? '{}')
const listeners = new Set<() => void>()

export const binding = (id: ShortcutId) => overrides[id] ?? SHORTCUTS[id].default
let paused = false
/** While paused (the command palette is open), only the palette's own shortcut matches. */
export const pauseShortcuts = (p: boolean) => {
  paused = p
}
export const isShortcut = (e: Keys, id: ShortcutId) => (!paused || id === 'commandPalette') && comboOf(e) === binding(id)

/** Rebind a shortcut; undefined restores the default. */
export function setShortcut(id: ShortcutId, combo?: string) {
  overrides = { ...overrides, [id]: combo }
  if (!combo || combo === SHORTCUTS[id].default) delete overrides[id]
  localStorage[KEY] = JSON.stringify(overrides)
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useShortcut = (id: ShortcutId) => useSyncExternalStore(subscribe, () => binding(id))
