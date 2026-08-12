import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListTodo, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'
import { useOrgContext } from '../lib/org-context'
import { TaskCommentsPanel } from './tasks-comments-panel'
import { TaskCreateDialog } from './tasks-create-dialog'

type TaskRow = {
  id: string
  title: string
  description?: string | null
  boardKey: string
  stageId: string
  visibility: 'internal' | 'shared'
  done: boolean
  createdAt: number
}

type StageRow = {
  id: string
  label: string
  boardKey: string
  isTerminal: boolean
}

export function TasksPage() {
  const { m } = useLocale()
  const { activeOrgId } = useOrgContext()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')

  const orgHeaders = useMemo(
    () => (activeOrgId ? { 'X-Org-Id': activeOrgId } : undefined),
    [activeOrgId],
  )

  const tasks = useQuery({
    queryKey: ['tasks', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: () =>
      apiFetch<{ tasks: TaskRow[] }>('/api/tasks', {
        headers: orgHeaders,
      }),
  })

  const stages = useQuery({
    queryKey: ['task-stages', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: () =>
      apiFetch<{ stages: StageRow[] }>('/api/tasks/stages', {
        headers: orgHeaders,
      }),
  })

  const comments = useQuery({
    queryKey: ['task-comments', activeOrgId, selectedId],
    enabled: Boolean(activeOrgId && selectedId),
    queryFn: () =>
      apiFetch<{ comments: { id: string; body: string; visibility: string; createdAt: number }[] }>(
        `/api/tasks/${selectedId}/comments`,
        { headers: orgHeaders },
      ),
  })

  const stageLabel = useMemo(() => {
    const map = new Map((stages.data?.stages ?? []).map((s) => [s.id, s.label]))
    return (id: string) => map.get(id) ?? id
  }, [stages.data?.stages])

  const createTask = useMutation({
    mutationFn: (input: {
      title: string
      description?: string
      visibility: 'internal' | 'shared'
      boardKey: string
    }) =>
      apiFetch('/api/tasks', {
        method: 'POST',
        headers: orgHeaders,
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks', activeOrgId] })
      toast.success(m.taskCreated)
      setOpen(false)
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const addComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/tasks/${selectedId}/comments`, {
        method: 'POST',
        headers: orgHeaders,
        body: JSON.stringify({ body, visibility: 'shared' }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task-comments', activeOrgId, selectedId] })
      setCommentBody('')
      toast.success(m.taskCommentAdded)
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  if (!activeOrgId) {
    return (
      <div className="space-y-4">
        <PageHeader title={m.navTasks} description={m.tasksDesc} />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{m.orgPickerEmpty}</EmptyTitle>
            <EmptyDescription>{m.tasksNeedOrg}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.navTasks}
        description={m.tasksDesc}
        actions={
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {m.taskCreate}
          </Button>
        }
      />

      {tasks.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : tasks.isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-12 text-center">
          <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {apiErrorToMessage(tasks.error, m)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void tasks.refetch()
            }}
          >
            {m.retry}
          </Button>
        </div>
      ) : (tasks.data?.tasks.length ?? 0) === 0 ? (
        <Empty>
          <EmptyHeader>
            <ListTodo className="size-8 text-muted-foreground" />
            <EmptyTitle>{m.tasksEmpty}</EmptyTitle>
            <EmptyDescription>{m.tasksEmptyDesc}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>{m.tasksList}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.taskTitle}</TableHead>
                    <TableHead>{m.taskStage}</TableHead>
                    <TableHead>{m.taskVisibility}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.data?.tasks.map((t) => (
                    <TableRow
                      key={t.id}
                      data-state={selectedId === t.id ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(t.id)}
                    >
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>{stageLabel(t.stageId)}</TableCell>
                      <TableCell>
                        <Badge variant={t.visibility === 'internal' ? 'secondary' : 'default'}>
                          {t.visibility === 'internal'
                            ? m.taskVisibilityInternal
                            : m.taskVisibilityShared}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <TaskCommentsPanel
            m={m}
            selectedId={selectedId}
            comments={comments.data?.comments}
            loading={comments.isLoading}
            isError={comments.isError}
            error={comments.error}
            onRetry={() => {
              void comments.refetch()
            }}
            commentBody={commentBody}
            onCommentBodyChange={setCommentBody}
            onAddComment={() => addComment.mutate(commentBody.trim())}
            pending={addComment.isPending}
          />
        </div>
      )}

      <TaskCreateDialog
        open={open}
        onOpenChange={setOpen}
        m={m}
        pending={createTask.isPending}
        onSubmit={async (input) => {
          await createTask.mutateAsync(input)
        }}
      />
    </div>
  )
}
