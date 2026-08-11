import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@kit/ui'
import type { Messages } from '../messages/fr'

export type CommentRow = { id: string; body: string; visibility: string; createdAt: number }

type Props = {
  m: Messages
  selectedId: string | null
  comments: CommentRow[] | undefined
  loading: boolean
  commentBody: string
  onCommentBodyChange: (v: string) => void
  onAddComment: () => void
  pending: boolean
}

export function TaskCommentsPanel({
  m,
  selectedId,
  comments,
  loading,
  commentBody,
  onCommentBodyChange,
  onAddComment,
  pending,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.taskComments}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">{m.taskSelectForComments}</p>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {(comments ?? []).map((c) => (
                <li key={c.id} className="rounded-md border border-border px-2 py-1.5">
                  {c.body}
                </li>
              ))}
              {(comments?.length ?? 0) === 0 && !loading ? (
                <li className="text-muted-foreground">{m.taskCommentsEmpty}</li>
              ) : null}
            </ul>
            <Textarea
              value={commentBody}
              onChange={(e) => onCommentBodyChange(e.target.value)}
              placeholder={m.taskCommentPlaceholder}
              rows={3}
            />
            <Button
              type="button"
              size="sm"
              disabled={!commentBody.trim() || pending}
              onClick={onAddComment}
            >
              {m.taskCommentAdd}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
