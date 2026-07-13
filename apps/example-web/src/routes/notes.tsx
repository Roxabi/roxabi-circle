import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'
import { createNoteSchema } from '../lib/schemas'

type Note = { id: string; title: string; body: string; createdAt: number }

export function NotesPage() {
  const { m } = useLocale()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)

  const notes = useQuery({
    queryKey: ['notes'],
    queryFn: () => apiFetch<{ notes: Note[] }>('/api/notes'),
  })

  const createNote = useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success(m.noteCreated)
      setOpen(false)
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const deleteNote = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notes'] })
      toast.success(m.noteDeleted)
      setPendingDelete(null)
    },
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  const form = useForm({
    defaultValues: { title: '', body: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = createNoteSchema.safeParse(value)
        if (parsed.success) return undefined
        const flat = parsed.error.flatten().fieldErrors
        return {
          form: m.errValidation,
          fields: {
            title: flat.title?.[0] ? m.errTitleRequired : undefined,
            body: flat.body?.[0] ? m.errValidation : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      await createNote.mutateAsync(value)
      formApi.reset()
    },
  })

  return (
    <div>
      <PageHeader
        title={m.notes}
        description={m.notesDesc}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            {m.createNote}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{m.notes}</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notes.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-12 text-center">
              <p className="text-sm font-medium text-destructive">{m.loadFailed}</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {apiErrorToMessage(notes.error, m)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void notes.refetch()
                }}
              >
                {m.retry}
              </Button>
            </div>
          ) : (notes.data?.notes ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">{m.empty}</p>
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                <Plus />
                {m.createNote}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.title}</TableHead>
                  <TableHead>{m.body}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(notes.data?.notes ?? []).map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {n.body || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.delete}
                        onClick={() => setPendingDelete(n)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.createNote}</DialogTitle>
            <DialogDescription>{m.notesDesc}</DialogDescription>
          </DialogHeader>
          <form
            id="create-note"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.Field name="title">
              {(field) => {
                const err = field.state.meta.errors[0]
                const errId = `${field.name}-error`
                const invalid = Boolean(err)
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.title}</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? errId : undefined}
                    />
                    {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="body">
              {(field) => {
                const err = field.state.meta.errors[0]
                const errId = `${field.name}-error`
                const invalid = Boolean(err)
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.body}</FieldLabel>
                    <Textarea
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      rows={4}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? errId : undefined}
                    />
                    {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                  </Field>
                )
              }}
            </form.Field>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button type="submit" form="create-note" disabled={createNote.isPending}>
              {m.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.delete}</DialogTitle>
            <DialogDescription>{m.confirmDelete}</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{pendingDelete?.title}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              {m.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteNote.isPending}
              onClick={() => pendingDelete && deleteNote.mutate(pendingDelete.id)}
            >
              {m.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
