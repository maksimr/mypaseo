import { CornerDownLeft, MessageCircle, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { isShortcut } from '../keymap'
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
