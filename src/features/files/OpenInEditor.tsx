import { Check, ChevronDown } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import vscodeIcon from '../../assets/vscode.svg'
import zedIcon from '../../assets/zed.svg'

// Logos from the VS Code app bundle and zed-industries/zed, on app-icon tiles.
// VS Code's is without its mask, shadow filters and overlay: Safari renders those at the image's own pixel size, so they blur when scaled.
const EDITORS = {
  vscode: { label: 'VS Code', icon: vscodeIcon },
  zed: { label: 'Zed', icon: zedIcon },
}
type EditorId = keyof typeof EDITORS

/** `vscode://file/…` / `zed://file/…` for a daemon path; Windows `C:\x` becomes `/C:/x`. */
const editorUrl = (id: EditorId, path: string) =>
  `${id}://file${('/' + path.replace(/\\/g, '/')).replace(/^\/+/, '/').split('/').map(encodeURIComponent).join('/')}`

/** A line: "Open in <editor>" opens the workspace in the last picked editor; the chevron's menu picks another and opens it there. */
export function OpenInEditor({ path }: { path: string }) {
  const [editor, setEditor] = useState<EditorId>(() => (localStorage.mypaseoEditor === 'zed' ? 'zed' : 'vscode'))
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId() // one per chat: chats stay mounted behind other tabs
  // shortcut: the path is on the daemon's machine, so this works for a local host only; remote hosts need vscode-remote / zed ssh URLs.
  const open = (id: EditorId) => {
    setEditor(id)
    localStorage.mypaseoEditor = id
    location.href = editorUrl(id, path)
  }

  return (
    <div className="open-in">
      <button onClick={() => open(editor)}>
        <img src={EDITORS[editor].icon} alt="" width={16} height={16} />
        <span className="truncate">Open in {EDITORS[editor].label}</span>
      </button>
      <button
        className="icon-btn"
        title="Choose Editor"
        popoverTarget={menuId}
        onClick={(e) => {
          // shortcut: fixed placement under the trigger, like Sidebar's menus; switch to CSS anchor positioning once Baseline.
          const r = e.currentTarget.getBoundingClientRect()
          menu.current!.style.top = `${r.bottom + 4}px`
          menu.current!.style.right = `${innerWidth - r.right}px`
        }}
      >
        <ChevronDown size={14} />
      </button>
      <div id={menuId} ref={menu} popover="auto" className="menu editor-menu" role="menu">
        {(Object.keys(EDITORS) as EditorId[]).map((id) => (
          <button key={id} role="menuitemradio" aria-checked={id === editor} popoverTarget={menuId} popoverTargetAction="hide" onClick={() => open(id)}>
            <img src={EDITORS[id].icon} alt="" width={16} height={16} />
            <span className="grow">{EDITORS[id].label}</span>
            <Check size={14} style={{ visibility: id === editor ? 'visible' : 'hidden' }} />
          </button>
        ))}
      </div>
    </div>
  )
}
