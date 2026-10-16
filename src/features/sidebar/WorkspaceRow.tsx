import { Archive, Check, ChevronDown, ChevronRight, Copy, Ellipsis, GitBranch, Loader2, Mail, MailOpen, Pencil, Pin, PinOff, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { errorText, type Agent, type Workspace } from '../../daemon'
import { clickable } from '../../a11y'
import { formatCombo, useShortcut } from '../../keymap'
import { client, markRead, markUnread, togglePin } from '../../store'
import { unreadPick } from '../../unread'
import { ProviderIcon } from '../../components/ProviderIcon'
import { Pull, Push } from '../../components/icons'
import { placeMenu } from '../../components/menu'
import { StatusMark } from './StatusMark'
import type { Selection } from './Sidebar'

export function WorkspaceRow({
  workspace: w,
  agents,
  collapsed: userCollapsed,
  pinned,
  onToggle,
  selection,
  onSelect,
  onArchive,
  onCloseAgent,
  onRename,
  syncing,
  onSync,
}: {
  workspace: Workspace
  agents: Agent[]
  collapsed: boolean
  pinned: boolean
  onToggle: () => void
  selection: Selection
  onSelect: (s: Selection) => void
  onArchive: (w: Workspace, deleteAgents: boolean) => void
  onCloseAgent: (a: Agent) => void
  onRename: () => void
  syncing?: 'pull' | 'push'
  onSync: (op: 'pull' | 'push') => void
}) {
  // A lone agent folds into its workspace row: the row already opens it.
  const collapsed = userCollapsed || agents.length < 2
  // A collapsed workspace hides its agents, so it shows their selection itself.
  const active = selection.workspaceId === w.id && (!selection.agentId || collapsed)
  const select = (agentId?: string) => onSelect({ projectId: w.projectId, workspaceId: w.id, agentId })
  const name = w.title || w.name
  // An untitled workspace is already named after its branch.
  const branch = w.gitRuntime?.currentBranch !== name ? w.gitRuntime?.currentBranch : undefined
  const menuId = `workspace-menu-${w.id}`
  const archiveKey = useShortcut('archiveWorkspace')
  const readKey = useShortcut('toggleRead')
  const pushKey = useShortcut('push')
  const archive = (deleteAgents: boolean) => onArchive(w, deleteAgents)
  const unread = agents.some((a) => a.requiresAttention)
  const pick = unreadPick(agents, w.id)
  const git = w.gitRuntime
  // A branch without an upstream was never pushed: its commits ahead of the base are unpushed.
  const unpushed = git?.aheadOfOrigin ?? (git?.remoteUrl ? git.aheadBehind?.ahead : 0) ?? 0
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const saveName = (value: string) => {
    setEditing(false)
    // The daemon trims it, and an empty title clears the override.
    if (value.trim() !== name) client(w.hostId).setWorkspaceTitle(w.id, value).catch((e) => alert(`Could not rename workspace: ${errorText(e)}`))
  }

  return (
    <>
      <div className={`row workspace ${active ? 'active' : ''}`} {...clickable(() => select(agents[0]?.id))}>
        {agents.length > 1 ? (
          <button
            className="chevron"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="chevron" />
        )}
        <span className="workspace-label">
          {editing ? (
            <input
              autoFocus
              className="rename-input"
              aria-label="Workspace name"
              defaultValue={name}
              autoComplete="off"
              spellCheck={false}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation() // keys edit the name: no app shortcuts, no row activation
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  e.currentTarget.value = name // so the blur saves nothing
                  e.currentTarget.blur()
                }
              }}
              onBlur={(e) => saveName(e.target.value)}
            />
          ) : (
            <span className="truncate" onDoubleClick={() => setEditing(true)}>
              {name}
            </span>
          )}
          {branch && (
            <span className="workspace-branch muted">
              <button
                className={`icon-btn hover-swap${copied ? ' copied' : ''}`}
                title="Copy Path"
                onClick={(e) => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(w.workspaceDirectory).then(
                    () => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1200)
                    },
                    (err) => alert(`Could not copy: ${errorText(err)}`),
                  )
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
              </button>
              <GitBranch size={11} className="status-mark" aria-label="Branch" />
              <span className="truncate">{branch}</span>
            </span>
          )}
        </span>
        <button className="icon-btn hover-swap" title="Workspace Actions" popoverTarget={menuId} onClick={placeMenu(menuId)}>
          <Ellipsis size={13} />
        </button>
        <button
          className="icon-btn hover-swap"
          title={`Archive (${formatCombo(archiveKey)})`}
          onClick={(e) => {
            e.stopPropagation()
            archive(false)
          }}
        >
          <Archive size={11} strokeWidth={1.75} />
        </button>
        {unpushed > 0 && !syncing && (
          <button
            className="icon-btn hover-swap"
            title={`Push (${formatCombo(pushKey)})`}
            onClick={(e) => {
              e.stopPropagation()
              onSync('push')
            }}
          >
            <Push size={13} />
          </button>
        )}
        {syncing ? (
          <Loader2 size={13} className="spin muted status-mark" aria-label={syncing === 'pull' ? 'Pulling…' : 'Pushing…'} />
        ) : (
          <>
            <StatusMark
              agents={agents}
              idle={
                unpushed > 0 ? (
                  <Push size={13} className="muted status-mark">
                    <title>{`${unpushed} unpushed commit${unpushed > 1 ? 's' : ''}`}</title>
                  </Push>
                ) : (
                  pinned && <Pin size={11} strokeWidth={1.75} className="muted status-mark" aria-label="Pinned" />
                )
              }
            />
          </>
        )}
      </div>
      <div id={menuId} popover="auto" className="menu">
        <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => select()}>
          <Plus size={14} /> New Agent
        </button>
        <button popoverTarget={menuId} popoverTargetAction="hide" onClick={onRename}>
          <Pencil size={14} /> Rename
        </button>
        <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => togglePin(w.id)}>
          {pinned ? <PinOff size={14} /> : <Pin size={14} />} {pinned ? 'Unpin' : 'Pin'}
        </button>
        {unread ? (
          <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => void markRead(w)}>
            <MailOpen size={14} /> Mark Read
          </button>
        ) : (
          pick && (
            <button popoverTarget={menuId} popoverTargetAction="hide" onClick={() => void markUnread(w, pick)}>
              <Mail size={14} /> Mark Unread
            </button>
          )
        )}
        {w.projectKind === 'git' && (
          <>
            <button popoverTarget={menuId} popoverTargetAction="hide" disabled={!!syncing} onClick={() => onSync('pull')}>
              <Pull size={14} /> Pull
            </button>
            <button popoverTarget={menuId} popoverTargetAction="hide" disabled={!!syncing} onClick={() => onSync('push')}>
              <Push size={14} /> Push
            </button>
          </>
        )}
        <button className="danger" popoverTarget={menuId} popoverTargetAction="hide" onClick={() => archive(true)}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
      {!collapsed &&
        agents.map((a) => (
          <div
            key={a.id}
            className={`row agent ${selection.agentId === a.id ? 'active' : ''}`}
            {...clickable(() => select(a.id))}
          >
            <ProviderIcon provider={a.provider} size={9} />
            <span className="grow truncate">{a.title || 'New agent'}</span>
            {(a.requiresAttention || a === pick) && (
              <button
                className="icon-btn hover-swap"
                title={`${a.requiresAttention ? 'Mark Read' : 'Mark Unread'} (${formatCombo(readKey)})`}
                onClick={(e) => {
                  e.stopPropagation()
                  void (a.requiresAttention ? markRead(w, a) : markUnread(w, a))
                }}
              >
                {a.requiresAttention ? <MailOpen size={11} strokeWidth={1.75} /> : <Mail size={11} strokeWidth={1.75} />}
              </button>
            )}
            <button
              className="icon-btn hover-swap"
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseAgent(a)
              }}
            >
              <X size={11} strokeWidth={1.75} />
            </button>
            <StatusMark agents={[a]} />
          </div>
        ))}
    </>
  )
}
