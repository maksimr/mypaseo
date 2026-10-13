import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { isShortcut } from '../keymap'
import { cancelComment, deleteComments, editComment, saveComment, type Editing, type Review, type Side } from '../review'

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
          <div key={c.id} className="review-comment">
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
      <textarea
        autoFocus
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
      <div className="review-editor-actions">
        <button className="btn ghost" onClick={cancelComment}>
          Cancel
        </button>
        <button className="btn primary" disabled={!body.trim()} onClick={save}>
          {editing.id ? 'Save' : 'Comment'}
        </button>
      </div>
    </div>
  )
}
