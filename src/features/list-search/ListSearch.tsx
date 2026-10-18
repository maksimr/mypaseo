import { Search } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { isShortcut } from '../../keymap'

/** A list's items: a side pane's rows, or an open menu's buttons (or the file tree rows a path crumb's menu holds). */
const ITEMS = '.row[tabindex], .menu > button:not(:disabled)'
/** A side pane's list below its toolbar, as in focus.ts. The search box sits over that toolbar. */
const LIST = ':scope > .tree, :scope > .panel-tabs + *'
const HIGHLIGHT = 'list-search' // ::highlight(list-search) in list-search.css

type State = {
  scope: HTMLElement
  /** The focus before the search: Escape returns there when nothing matched. */
  prev: HTMLElement
  query: string
  found: boolean
  /** The match Enter opens. The focus is in the search box, so `[data-list-search]` outlines it instead. */
  current?: HTMLElement
}

const items = (scope: HTMLElement) => [...scope.querySelectorAll<HTMLElement>(ITEMS)].filter((el) => el.checkVisibility())

/** Where `re` first matches the item's label, its first `.truncate` (a row's name, not its branch or host), else all its text. */
function find(item: HTMLElement, re: RegExp) {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(item.querySelector('.truncate') ?? item, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  const m = re.exec(nodes.map((n) => n.data).join(''))
  if (!m) return
  // The match may cross text nodes: a changed file's name and its directory.
  const range = new Range()
  const end = m.index + m[0].length
  let at = 0
  for (const n of nodes) {
    if (m.index >= at && m.index < at + n.length) range.setStart(n, m.index - at)
    if (end > at && end <= at + n.length) range.setEnd(n, end - at)
    at += n.length
  }
  return range
}

/** The items whose label holds `query`, ignoring case, in list order. */
function matches(all: HTMLElement[], query: string) {
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return all.flatMap((item) => {
    const range = find(item, re)
    return range ? [{ item, range }] : []
  })
}

/**
 * Speed search, as in JetBrains IDEs: `/` in the sidebar, the file panel or an open menu opens a search box over the list.
 * Typing outlines the first matching row and highlights every match. ↑/↓ go through the matches, Enter opens the current
 * one, Escape or Tab stop on it; a click or the focus leaving the box stops the search.
 */
export function ListSearch() {
  const [search, setSearch] = useState<State | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (search) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target
      if (!isShortcut(e, 'listSearch') || !(t instanceof HTMLElement) || t.matches('input, textarea, select') || t.isContentEditable) return
      // An open menu first: its trigger keeps the focus, outside it.
      const scope = [...document.querySelectorAll<HTMLElement>('.menu:popover-open')].at(-1) ?? t.closest<HTMLElement>('.sidebar, .panel')
      const all = scope ? items(scope) : []
      if (!scope || !all.length) return
      e.preventDefault() // no "/" typed
      setSearch({ scope, prev: t, query: '', found: true, current: all.find((el) => el.contains(t)) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])

  const scope = search?.scope
  useEffect(() => {
    const el = box.current
    if (!scope || !el) return
    const r = (scope.querySelector(LIST) ?? scope).getBoundingClientRect()
    el.showPopover()
    // Above the list; below a menu with no room above it.
    const up = r.top >= el.offsetHeight + 8
    el.style.top = up ? '' : `${r.bottom + 4}px`
    el.style.bottom = up ? `${innerHeight - r.top + 4}px` : ''
    el.style.left = `${r.left + 4}px`
    el.style.width = `${r.width - 8}px`
    input.current?.focus()
    const close = () => setSearch(null)
    const outside = (e: Event) => e.target instanceof Node && !el.contains(e.target) && close()
    document.addEventListener('focusin', outside)
    document.addEventListener('pointerdown', outside, true)
    scope.addEventListener('toggle', close) // a menu closed
    return () => {
      if ('highlights' in CSS) CSS.highlights.delete(HIGHLIGHT)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('pointerdown', outside, true)
      scope.removeEventListener('toggle', close)
    }
  }, [scope])

  const current = search?.current
  useEffect(() => {
    if (!current) return
    current.toggleAttribute('data-list-search', true)
    current.scrollIntoView({ block: 'nearest' })
    return () => current.removeAttribute('data-list-search')
  }, [current])

  if (!search) return null

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    const all = items(search.scope)
    const found = matches(all, query)
    // The current row stays while it matches, else the next match below it; with no match, it stays too.
    const from = current ? all.indexOf(current) : 0
    const next = !query || found.some((m) => m.item === current) ? current : (found.find((m) => all.indexOf(m.item) >= from) ?? found[0])?.item
    if ('highlights' in CSS) CSS.highlights.set(HIGHLIGHT, new Highlight(...(query ? found.map((m) => m.range) : [])))
    setSearch({ ...search, query, found: !query || found.length > 0, current: next ?? current })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault() // the caret stays
      const found = matches(items(search.scope), search.query).map((m) => m.item)
      const i = current ? found.indexOf(current) : -1
      const next = e.key === 'ArrowDown' ? (found[i + 1] ?? found[0]) : (found[i - 1] ?? found.at(-1))
      if (next) setSearch({ ...search, current: next })
    } else if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault() // Escape keeps an open menu open; Tab lands on the match, not past it
      setSearch(null)
      ;(current ?? search.prev).focus()
      if (e.key === 'Enter') current?.click()
    }
  }

  return createPortal(
    // A popover, so it shows above an open menu. Inside the menu's DOM, a click in it isn't outside the menu, which stays open.
    <div ref={box} popover="manual" className={`list-search ${search.found ? '' : 'none'}`}>
      <Search size={13} />
      <input
        ref={input}
        aria-label="Search in List"
        placeholder="Search"
        autoComplete="off"
        spellCheck={false}
        value={search.query}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    </div>,
    search.scope.matches('[popover]') ? search.scope : document.body,
  )
}
