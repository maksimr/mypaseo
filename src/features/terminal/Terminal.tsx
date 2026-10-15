import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, SquareTerminal } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { clickable } from '../../a11y'
import { ActiveViewContext } from '../../activeView'
import { errorText, type TerminalInfo } from '../../daemon'
import { formatCombo, isShortcut, SHORTCUT_IDS, useShortcut } from '../../keymap'
import { useDaemon } from '../../store'

/** The right panel's Terminals section: the workspace's terminals, each opening its tab. */
export function TerminalList({ terminals, activeId, onOpen, onNew }: { terminals: TerminalInfo[]; activeId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const newKey = useShortcut('newTerminal')
  return (
    <div className="changes-list">
      {terminals.map((t) => (
        <div key={t.id} className={`row ${t.id === activeId ? 'active' : ''}`} {...clickable(() => onOpen(t.id))}>
          <SquareTerminal size={14} className="muted" />
          <span className="truncate">{t.title || t.name}</span>
        </div>
      ))}
      <div className="row muted" title={`New Terminal (${formatCombo(newKey)})`} {...clickable(onNew)}>
        <Plus size={14} />
        <span>New Terminal</span>
      </div>
    </div>
  )
}

// In a terminal the shell gets every key but the app shortcuts with Cmd or Ctrl+Shift, which shells don't use.
const appKey = (e: KeyboardEvent) => (e.metaKey || (e.ctrlKey && e.shiftKey)) && SHORTCUT_IDS.some((id) => isShortcut(e, id))

/** A daemon terminal in xterm.js: replays its screen and scrollback, then streams output and sends keys and size. */
export function TerminalView({ terminalId }: { terminalId: string }) {
  const daemon = useDaemon()
  const host = useRef<HTMLDivElement>(null)
  const xterm = useRef<Terminal>(null)
  const [error, setError] = useState<string>()
  useEffect(() => {
    const el = host.current!
    const css = getComputedStyle(el)
    const term = (xterm.current = new Terminal({
      fontFamily: css.getPropertyValue('--mono'),
      fontSize: 18,
      lineHeight: 1.125,
      fontWeightBold: 'normal', // thin like the tool output, which has no bold
      cursorBlink: true,
      macOptionIsMeta: true, // Option+B/F move by word, as in Paseo desktop
      scrollback: 10000,
      theme: {
        background: css.getPropertyValue('--bg'),
        foreground: css.getPropertyValue('--text'),
        cursor: css.getPropertyValue('--accent'),
        selectionBackground: 'rgba(116, 173, 232, 0.3)',
        // Soft pastel ANSI colors instead of xterm's saturated defaults. Bold text uses the bright ones.
        black: '#3a3a3a',
        red: '#c86464',
        green: '#8cbf7f',
        yellow: '#d6d27a',
        blue: '#6b70e0',
        magenta: '#c27fd1',
        cyan: '#6fc0d4',
        white: '#d4d4d4',
        brightBlack: '#6e6e6e',
        brightRed: '#e06c6c',
        brightGreen: '#93c88a',
        brightYellow: '#e6e47a',
        brightBlue: '#7b7ef0',
        brightMagenta: '#d495e3',
        brightCyan: '#80d0e4',
        brightWhite: '#f0f0f0',
      },
    }))
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.attachCustomKeyEventHandler((e) => !appKey(e))
    term.open(el)
    fit.fit()
    // The daemon keeps one size per terminal; claim makes it ours, update only applies while it still is.
    const size = (intent: 'claim' | 'update') => daemon.sendTerminalInput(terminalId, { type: 'resize', rows: term.rows, cols: term.cols, intent })
    size('claim')
    // xterm answers terminal queries found in the replayed screen; those answers must not reach the shell.
    let restoring = false
    const sub = daemon.observeTerminal(
      terminalId,
      (ev) => {
        if (ev.type === 'output') term.write(ev.data)
        if (ev.type !== 'restore') return
        restoring = true
        term.write('\x1bc') // reset, queued behind earlier output
        term.write(ev.data, () => (restoring = false))
      },
      { restore: { mode: 'full-snapshot', size: { rows: term.rows, cols: term.cols } } },
    )
    sub.ready.then((p) => setError(p.error ?? undefined), (e) => setError(errorText(e)))
    const input = term.onData((data) => restoring || daemon.sendTerminalInput(terminalId, { type: 'input', data }))
    const resized = term.onResize(() => size('update'))
    // Another client may have sized it to its own window; focusing this one takes it back.
    const claim = () => size('claim')
    term.textarea?.addEventListener('focus', claim)
    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)
    return () => {
      ro.disconnect()
      input.dispose()
      resized.dispose()
      void sub.release().catch(() => {})
      term.dispose()
    }
  }, [daemon, terminalId])
  // Shown (mounted, or back from behind another tab): the keys go to the shell.
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (active) xterm.current?.focus()
  }, [active])

  return (
    <>
      {error && <div className="empty">{error}</div>}
      <div
        ref={host}
        className="term-view"
        onKeyDown={(e) => {
          if (!appKey(e.nativeEvent)) e.stopPropagation() // keep window shortcuts (Ctrl+W, Escape…) out of the shell's keys
        }}
      />
    </>
  )
}
