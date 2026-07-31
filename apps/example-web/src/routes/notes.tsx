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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@gosilex/ui'
import { Markdown } from '@tanstack/markdown/react'
import { useForm } from '@tanstack/react-form'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnFiltersState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'
import { createNoteSchema } from '../lib/schemas'

type Note = { id: string; title: string; body: string; createdAt: number }

type BodyFilter = 'all' | 'with' | 'empty'

const col = createColumnHelper<Note>()

export function NotesPage() {
  const { m } = useLocale()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [bodyFilter, setBodyFilter] = useState<BodyFilter>('all')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

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

  useHotkey('Mod+Shift+N', () => setOpen(true), {
    preventDefault: true,
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
            title: flat.title?.[0] ? m.errValidation : undefined,
            body: flat.body?.[0] ? m.errValidation : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      createNote.mutate(value)
      form.reset()
    },
  })

  const data = notes.data?.notes ?? []

  const columns = useMemo(
    () => [
      col.accessor('title', {
        header: m.title,
        enableSorting: true,
        filterFn: 'includesString',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      col.accessor('body', {
        header: m.body,
        enableSorting: true,
        // Custom filter for empty / with body
        filterFn: (row, _id, value: BodyFilter) => {
          if (!value || value === 'all') return true
          const body = (row.getValue('body') as string | undefined)?.trim() ?? ''
          if (value === 'with') return body.length > 0
          if (value === 'empty') return body.length === 0
          return true
        },
        cell: (info) => {
          const body = info.getValue()
          if (!body?.trim()) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <div className="prose prose-sm dark:prose-invert line-clamp-3 max-w-md text-muted-foreground [&_p]:m-0">
              <Markdown>{body}</Markdown>
            </div>
          )
        },
      }),
      col.display({
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={m.delete}
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ),
      }),
    ],
    [m.title, m.body, m.delete],
  )

  const filterItems = useMemo(
    () => [
      { value: 'all' as const, label: m.tableFilterAll },
      { value: 'with' as const, label: m.tableFilterWithBody },
      { value: 'empty' as const, label: m.tableFilterEmptyBody },
    ],
    [m.tableFilterAll, m.tableFilterWithBody, m.tableFilterEmptyBody],
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const setBodyFilterValue = (value: BodyFilter) => {
    setBodyFilter(value)
    setColumnFilters(value === 'all' ? [] : [{ id: 'body', value }])
  }

  const rows = table.getRowModel().rows
  const hasSourceData = data.length > 0

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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{m.notes}</CardTitle>
          {hasSourceData ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={m.tableSearch}
                className="sm:w-56"
                aria-label={m.tableSearch}
              />
              <Select
                items={filterItems}
                value={bodyFilter}
                onValueChange={(v) => {
                  if (v === 'all' || v === 'with' || v === 'empty') setBodyFilterValue(v)
                }}
              >
                <SelectTrigger className="sm:w-40" aria-label={m.tableFilter}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {filterItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {notes.isLoading ? (
            <div className="flex flex-col gap-2">
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
          ) : !hasSourceData ? (
            <Empty className="border border-dashed border-border py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plus className="size-4" aria-hidden />
                </EmptyMedia>
                <EmptyTitle>{m.empty}</EmptyTitle>
                <EmptyDescription>{m.notesDesc}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                  <Plus />
                  {m.createNote}
                </Button>
              </EmptyContent>
            </Empty>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{m.tableNoResults}</p>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => {
                      const canSort = header.column.getCanSort()
                      const sorted = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          className={header.column.id === 'actions' ? 'w-[100px]' : undefined}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                              onClick={header.column.getToggleSortingHandler()}
                              title={m.tableSortHint}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === 'asc' ? (
                                <ArrowUp className="size-3.5 opacity-70" aria-hidden />
                              ) : sorted === 'desc' ? (
                                <ArrowDown className="size-3.5 opacity-70" aria-hidden />
                              ) : (
                                <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
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
                      placeholder="Markdown OK — **bold**, lists, links…"
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
          {pendingDelete?.body?.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
              <Markdown>{pendingDelete.body}</Markdown>
            </div>
          ) : null}
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
