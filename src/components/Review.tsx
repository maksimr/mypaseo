import { ChevronDown, ChevronUp, CornerDownLeft, MessageCircle, Pencil, Trash2, X } from 'lucide-react'
import { useContext, useEffect, useState, type RefObject } from 'react'
import { ActiveViewContext } from '../activeView'
import { formatCombo, isShortcut, useShortcut } from '../keymap'
import { cancelComment, deleteComments, editComment, revealRef, saveComment, type Editing, type Review, type Side } from '../review'

/** The review comments and open editor under one line of a file or diff; nothing when it has none. */
export function ReviewThread({ review, path, side, line }: { review: Review; path: string; side: Side; line: number }) {
  const here = (c: { path: string; side: Side; line: number }) => c.path === path && c.side === side && c.line === line
  const comments = review.comments.filter(here)
  const editing = review.editing && here(review.editing) ? review.editing : null
  if (!comments.length && !editing) return null
  return (
    <div className="review-thread">
      {comments.map((c) =>
        c.id === editing?.id ? (
          <CommentEditor key={c.id} editing={editing} />
        ) : (
          <div key={c.id} ref={revealRef(c.id)} className="review-comment" onDoubleClick={() => editComment(review.key, c)}>
            <MessageCircle size={13} />
            <span className="grow pre-wrap">{c.body}</span>
            <button className="icon-btn" title="Edit Comment" onClick={() => editComment(review.key, c)}>
              <Pencil size={13} />
            </button>
            <button className="icon-btn danger" title="Delete Comment" onClick={() => deleteComments(review.key, [c.id])}>
              <Trash2 size={13} />
            </button>
          </div>
        ),
      )}
      {editing && !editing.id && <CommentEditor editing={editing} />}
    </div>
  )
}

// The thread last jumped to and the view's scroll then: one near the end can't reach the middle, so position alone would stop on it.
let last: { el: Element; top: number } | undefined

/** Scrolls `root` to the middle of its next (dir 1) or previous (-1) comment thread. */
function goToComment(root: HTMLElement, dir: number) {
  const els = [...root.querySelectorAll('.review-thread')]
  const mid = (el: Element) => {
    const r = el.getBoundingClientRect()
    return (r.top + r.bottom) / 2
  }
  const y = mid(root)
  const el =
    last && last.top === root.scrollTop && els.includes(last.el)
      ? els[els.indexOf(last.el) + dir]
      : dir > 0
        ? els.find((e) => mid(e) > y + 1)
        : els.findLast((e) => mid(e) < y - 1)
  if (!el) return
  el.scrollIntoView({ block: 'center' })
  last = { el, top: root.scrollTop }
}

/** Previous and next comment buttons, with their shortcuts, for the view `root` scrolls. */
export function CommentNav({ root }: { root: RefObject<HTMLElement | null> }) {
  const prevKey = useShortcut('prevComment')
  const nextKey = useShortcut('nextComment')
  // Kept mounted behind another tab, the view leaves the shortcuts to the shown one.
  const active = useContext(ActiveViewContext)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const dir = isShortcut(e, 'nextComment') ? 1 : isShortcut(e, 'prevComment') ? -1 : 0
      if (!dir || !root.current) return
      e.preventDefault()
      goToComment(root.current, dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, root])
  return (
    <span className="comment-nav">
      <MessageCircle size={13} />
      <span className="comment-arrows">
        <button className="icon-btn" title={`Go to Previous Comment (${formatCombo(prevKey)})`} onClick={() => root.current && goToComment(root.current, -1)}>
          <ChevronUp size={12} />
        </button>
        <button className="icon-btn" title={`Go to Next Comment (${formatCombo(nextKey)})`} onClick={() => root.current && goToComment(root.current, 1)}>
          <ChevronDown size={12} />
        </button>
      </span>
    </span>
  )
}

function CommentEditor({ editing }: { editing: Editing }) {
  const [body, setBody] = useState(editing.body)
  const save = () => body.trim() && saveComment(body.trim())
  return (
    <div className="review-editor">
      <MessageCircle size={13} />
      <textarea
        autoFocus
        rows={1}
        name="comment"
        aria-label="Comment"
        placeholder="Leave a comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') {
            e.stopPropagation()
            cancelComment()
          } else if (isShortcut(e, 'send')) {
            e.preventDefault()
            save()
          }
        }}
      />
      <button className="icon-btn" title="Cancel" onClick={cancelComment}>
        <X size={14} />
      </button>
      <button className="icon-btn" title={editing.id ? 'Save' : 'Comment'} disabled={!body.trim()} onClick={save}>
        <CornerDownLeft size={14} />
      </button>
    </div>
  )
}
