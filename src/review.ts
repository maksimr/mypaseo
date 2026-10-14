import { useSyncExternalStore } from 'react'
import type { ReviewAttachment } from './daemon'
import type { SelectedLines } from './selection'
import { useHostId } from './store'

type Line = ReviewAttachment['comments'][number]['context']['targetLine']
export type Side = 'old' | 'new'
/** A review comment on selected lines of a file or diff. It hangs under the last one: `line` on `side`. */
export type ReviewComment = { id: string; path: string; ref: string; side: Side; line: number; lines: Line[]; body: string }
/** The comment being written in the editor: a new one, or an edit of the one with `id`. `key`: its workspace, see reviewKey. */
export type Editing = Omit<ReviewComment, 'id'> & { id?: string; key: string }

// Comments per host and workspace directory, kept in this browser like Paseo desktop's review drafts; one editor open at a time.
let state: { comments: Record<string, ReviewComment[]>; editing: Editing | null } = {
  comments: JSON.parse(localStorage.mypaseoReview ?? '{}'),
  editing: null,
}
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
function emit(next: typeof state) {
  state = next
  localStorage.mypaseoReview = JSON.stringify(next.comments)
  listeners.forEach((l) => l())
}
const setEditing = (editing: Editing | null) => emit({ ...state, editing })
function setComments(key: string, f: (cs: ReviewComment[]) => ReviewComment[], editing = state.editing) {
  const { [key]: cs = [], ...comments } = state.comments
  const next = f(cs)
  emit({ comments: next.length ? { ...comments, [key]: next } : comments, editing })
}

export const reviewKey = (hostId: string, cwd: string) => `${hostId}:${cwd}`
const NONE: ReviewComment[] = []
export function useReview(cwd: string | undefined) {
  const key = reviewKey(useHostId(), cwd ?? '')
  const s = useSyncExternalStore(subscribe, () => state)
  return { key, comments: (cwd && s.comments[key]) || NONE, editing: s.editing?.key === key ? s.editing : null }
}
export type Review = ReturnType<typeof useReview>

/** A rendered line of a file view (`.code-line`) or diff (`.dl`) as the review attachment's context line. */
function lineOf(el: Element): Line {
  const [a, b] = [...el.querySelectorAll('.ln')].map((e) => Number(e.textContent) || null)
  if (el.matches('.code-line')) return { oldLineNumber: null, newLineNumber: a, type: 'context', content: el.querySelector('.lc')!.textContent.replace(/\n$/, '') }
  const type = el.classList.contains('add') ? 'add' : el.classList.contains('remove') ? 'remove' : 'context'
  return { oldLineNumber: a, newLineNumber: b, type, content: el.querySelector('.dc')!.textContent }
}

/** Opens the editor for a new comment under the selection's last line. */
export function startComment(key: string, s: SelectedLines) {
  const all = [...s.line.closest('[data-path]')!.querySelectorAll('.code-line, .dl')]
  const lines = all.slice(all.indexOf(s.start), all.indexOf(s.line) + 1).map(lineOf)
  const last = lines.at(-1)!
  const side = last.type === 'remove' ? 'old' : 'new'
  setEditing({ key, path: s.path, ref: s.ref, side, line: (side === 'old' ? last.oldLineNumber : last.newLineNumber)!, lines, body: '' })
}
export const editComment = (key: string, c: ReviewComment) => setEditing({ ...c, key })
export const cancelComment = () => setEditing(null)
export function saveComment(body: string) {
  const { key, id, ...c } = state.editing!
  setComments(key, (cs) => (id ? cs.map((x) => (x.id === id ? { ...x, body } : x)) : [...cs, { ...c, id: crypto.randomUUID(), body }]), null)
}
export const deleteComments = (key: string, ids: string[]) => setComments(key, (cs) => cs.filter((c) => !ids.includes(c.id)))

// The comment to scroll to once its row renders: the composer's Review chip opens its file or diff first.
let revealing: string | undefined
export const revealComment = (id: string) => (revealing = id)
export const revealRef = (id: string) => (el: HTMLElement | null) => {
  if (!el || id !== revealing) return
  revealing = undefined
  el.scrollIntoView({ block: 'center' })
}

/** The daemon renders this into the prompt as "Comment N: path:side:line", the body, and the commented lines. */
export const reviewAttachment = (cwd: string, comments: ReviewComment[]): ReviewAttachment => ({
  type: 'review',
  mimeType: 'application/paseo-review',
  cwd,
  mode: 'uncommitted',
  comments: comments.map((c) => ({
    filePath: c.path,
    side: c.side,
    lineNumber: c.line,
    body: c.body,
    context: { hunkHeader: c.ref, targetLine: c.lines.at(-1)!, lines: c.lines },
  })),
})
