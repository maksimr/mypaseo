import { useSyncExternalStore } from 'react'

export const isMac = navigator.userAgent.includes('Mac')
const mod = isMac ? 'Meta' : 'Ctrl'

/** Remappable shortcuts. A combo is modifiers in Ctrl, Alt, Shift, Meta order plus a KeyboardEvent.code, e.g. "Meta+KeyB". */
export const SHORTCUTS = {
  toggleSidebar: { label: 'Toggle Sidebar', description: 'Show or hide the project sidebar.', default: `${mod}+KeyB` },
  togglePanel: { label: 'Toggle File Panel', description: 'Show or hide the right panel with files and changes.', default: `${mod}+KeyE` },
  nextTab: { label: 'Next Tab', description: 'Go to the next tab of the current workspace: chat, changes, open files.', default: 'Ctrl+BracketRight' },
  prevTab: { label: 'Previous Tab', description: 'Go to the previous tab of the current workspace.', default: 'Ctrl+BracketLeft' },
  // Browsers keep ⌘N / Ctrl+N (new window) for themselves.
  newWorkspace: { label: 'New Workspace', description: 'Start a new workspace in the current project.', default: isMac ? 'Ctrl+KeyN' : 'Alt+KeyN' },
  nextWorkspace: { label: 'Next Workspace', description: 'Go to the workspace below in the sidebar.', default: 'Ctrl+Shift+BracketRight' },
  prevWorkspace: { label: 'Previous Workspace', description: 'Go to the workspace above in the sidebar.', default: 'Ctrl+Shift+BracketLeft' },
  prevHunk: { label: 'Go to Previous Hunk', description: 'Scroll the diff view to the previous change.', default: 'Alt+Shift+ArrowUp' },
  nextHunk: { label: 'Go to Next Hunk', description: 'Scroll the diff view to the next change.', default: 'Alt+Shift+ArrowDown' },
  // Mac: Mail's Archive. Elsewhere Alt, like New Workspace.
  archiveWorkspace: { label: 'Archive Workspace', description: 'Archive the selected workspace.', default: isMac ? 'Ctrl+Meta+KeyA' : 'Alt+KeyA' },
  removeWorkspace: { label: 'Remove Workspace', description: 'Delete the agents of the selected workspace, then archive it.', default: isMac ? 'Ctrl+Meta+Backspace' : 'Alt+Delete' },
  // Browsers keep ⌘L / Ctrl+L (address bar) for themselves.
  addToChat: { label: 'Add Selection to Chat', description: 'Insert the selected lines of a file or diff into the chat composer as path:start-end.', default: isMac ? 'Ctrl+KeyL' : 'Alt+KeyL' },
  send: { label: 'Send', description: 'Send the message in the chat composer.', default: `${mod}+Enter` },
  stageAll: { label: 'Stage All', description: 'Stage every change from the diff view.', default: isMac ? 'Ctrl+Meta+KeyY' : 'Alt+KeyY' },
  commit: { label: 'Commit', description: 'Open the commit dialog from the diff view, then commit the staged changes.', default: `${mod}+Enter` },
  // Zed's binding. Shift sorts before Meta in a combo.
  amend: { label: 'Amend Commit', description: 'Amend the last commit from the commit dialog. An empty message keeps its message.', default: isMac ? 'Shift+Meta+Enter' : 'Ctrl+Shift+Enter' },
  cycleThinking: { label: 'Cycle Thinking Level', description: 'Switch to the next thinking level from the chat composer.', default: 'Shift+Tab' },
  pickModel: { label: 'Choose Model', description: 'Open the model picker from the chat composer.', default: isMac ? 'Alt+Meta+Slash' : 'Ctrl+Alt+Slash' },
  // Pi's binding, Ctrl on Mac too.
  expandTools: { label: 'Expand Tool Output', description: 'Expand or collapse the output of every tool call in the chat.', default: 'Ctrl+KeyO' },
  // Ctrl on Mac too: Safari keeps ⌘, and ⇧⌘, for itself and never passes them to the page.
  openSettings: { label: 'Open Settings', description: 'Open this settings window.', default: 'Ctrl+Comma' },
}
export type ShortcutId = keyof typeof SHORTCUTS
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[]

type Keys = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
// Physical key (code), not key: Cmd+B must still match on a Cyrillic layout, and Alt+B on Mac types "∫".
export const comboOf = (e: Keys) =>
  [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.code].filter(Boolean).join('+')

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
export const isShortcut = (e: Keys, id: ShortcutId) => comboOf(e) === binding(id)

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
