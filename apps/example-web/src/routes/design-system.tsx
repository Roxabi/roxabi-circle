import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gosilex/ui'
import { Markdown } from '@tanstack/markdown/react'
import { useForm } from '@tanstack/react-form'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  Copy,
  Info,
  LayoutTemplate,
  Palette,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '../components/app-shell'
import { useLocale } from '../lib/locale'

type DemoRow = { id: string; name: string; status: 'ok' | 'pending' }

const demoCol = createColumnHelper<DemoRow>()

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'hello kit', status: 'ok' },
  { id: '2', name: 'verify-kit', status: 'ok' },
  { id: '3', name: 'draft', status: 'pending' },
]

const demoFormSchema = z.object({
  title: z.string().min(1),
})

const TOKEN_SWATCHES = [
  { name: 'background', className: 'bg-background border' },
  { name: 'foreground', className: 'bg-foreground' },
  { name: 'card', className: 'bg-card border' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'secondary', className: 'bg-secondary border' },
  { name: 'muted', className: 'bg-muted border' },
  { name: 'accent', className: 'bg-accent border' },
  { name: 'destructive', className: 'bg-destructive' },
  { name: 'border', className: 'bg-border' },
  { name: 'ring', className: 'bg-ring' },
  { name: 'sidebar', className: 'bg-sidebar border' },
  { name: 'sidebar-primary', className: 'bg-sidebar-primary' },
] as const

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-1 border-b border-border pb-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function DemoBox({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ''}`}>
      {title ? (
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export function DesignSystemPage() {
  const { m } = useLocale()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const toc = [
    { id: 'foundations', label: m.dsFoundations },
    { id: 'buttons', label: 'Button' },
    { id: 'forms', label: m.dsForms },
    { id: 'feedback', label: m.dsFeedback },
    { id: 'overlays', label: m.dsOverlays },
    { id: 'data', label: m.dsData },
    { id: 'tanstack', label: m.dsTanstack },
    { id: 'templates', label: m.dsTemplates },
  ]

  const tsForm = useForm({
    defaultValues: { title: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = demoFormSchema.safeParse(value)
        if (parsed.success) return undefined
        return { form: m.errValidation, fields: { title: m.errValidation } }
      },
    },
    onSubmit: async ({ value }) => {
      toast.success('TanStack Form', { description: value.title })
      tsForm.reset()
    },
  })

  const [tsSorting, setTsSorting] = useState<SortingState>([])
  const [tsSearch, setTsSearch] = useState('')
  const [tsStatus, setTsStatus] = useState<'all' | 'ok' | 'pending'>('all')

  const tsColumns = useMemo(
    () => [
      demoCol.accessor('name', {
        header: 'Name',
        enableSorting: true,
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      demoCol.accessor('status', {
        header: 'Status',
        enableSorting: true,
        filterFn: (row, _id, value: string) => {
          if (!value || value === 'all') return true
          return row.getValue('status') === value
        },
        cell: (info) => (
          <Badge variant={info.getValue() === 'ok' ? 'secondary' : 'outline'}>
            {info.getValue()}
          </Badge>
        ),
      }),
    ],
    [],
  )
  const tsStatusItems = useMemo(
    () => [
      { value: 'all' as const, label: m.tableFilterAll },
      { value: 'ok' as const, label: 'ok' },
      { value: 'pending' as const, label: 'pending' },
    ],
    [m.tableFilterAll],
  )
  const tsTable = useReactTable({
    data: DEMO_ROWS,
    columns: tsColumns,
    state: {
      sorting: tsSorting,
      globalFilter: tsSearch,
      columnFilters: tsStatus === 'all' ? [] : [{ id: 'status', value: tsStatus }],
    },
    onSortingChange: setTsSorting,
    onGlobalFilterChange: setTsSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const mdSample = `### TanStack Markdown

Body notes use the same renderer on **\`/app/notes\`**.

- list item
- **bold** and \`code\`
`

  return (
    <div className="space-y-10">
      <PageHeader
        title={m.designSystem}
        description={m.designSystemDesc}
        actions={
          <Badge variant="secondary" className="gap-1">
            <Palette className="size-3" />
            admin
          </Badge>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="sticky top-20 hidden h-fit space-y-1 lg:block">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {m.dsOnThisPage}
          </p>
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-12">
          {/* Foundations */}
          <Section id="foundations" title={m.dsFoundations} description={m.dsFoundationsDesc}>
            <DemoBox title="Color tokens">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {TOKEN_SWATCHES.map((t) => (
                  <div key={t.name} className="space-y-1.5">
                    <div className={`h-12 w-full rounded-lg ${t.className}`} />
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{t.name}</p>
                  </div>
                ))}
              </div>
            </DemoBox>
            <div className="grid gap-4 md:grid-cols-2">
              <DemoBox title="Typography">
                <div className="space-y-2">
                  <p className="text-2xl font-semibold tracking-tight">Heading 2xl / semibold</p>
                  <p className="text-lg font-semibold">Heading lg</p>
                  <p className="text-base">Body base — Geist Variable</p>
                  <p className="text-sm text-muted-foreground">Muted sm — secondary copy</p>
                  <p className="font-mono text-xs">Mono xs — sk_… / requestId</p>
                </div>
              </DemoBox>
              <DemoBox title="Radius & surface">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="size-12 rounded-sm border bg-muted" title="sm" />
                  <div className="size-12 rounded-md border bg-muted" title="md" />
                  <div className="size-12 rounded-lg border bg-muted" title="lg" />
                  <div className="size-12 rounded-xl border bg-muted" title="xl" />
                  <div className="size-12 rounded-full border bg-muted" title="full" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Tokens shadcn base-nova · light/dark via classe{' '}
                  <code className="rounded bg-muted px-1">.dark</code>
                </p>
              </DemoBox>
            </div>
          </Section>

          {/* Buttons */}
          <Section
            id="buttons"
            title="Button"
            description="Variants + sizes (@base-ui/react/button)"
          >
            <DemoBox title="Variants">
              <div className="flex flex-wrap gap-2">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
            </DemoBox>
            <DemoBox title="Sizes">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs">XS</Button>
                <Button size="sm">SM</Button>
                <Button size="default">Default</Button>
                <Button size="lg">LG</Button>
                <Button size="icon">
                  <Settings />
                </Button>
                <Button size="icon-sm" variant="outline">
                  <Plus />
                </Button>
              </div>
            </DemoBox>
            <DemoBox title="With icons">
              <div className="flex flex-wrap gap-2">
                <Button>
                  <Plus data-icon="inline-start" />
                  Create
                </Button>
                <Button variant="outline">
                  Continue
                  <ChevronRight data-icon="inline-end" />
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>
            </DemoBox>
          </Section>

          {/* Forms */}
          <Section id="forms" title={m.dsForms} description="Input, Textarea, Label, Field">
            <DemoBox>
              <FieldGroup className="max-w-md">
                <Field>
                  <FieldLabel htmlFor="ds-email">Email</FieldLabel>
                  <Input id="ds-email" type="email" placeholder="you@gosilex.local" />
                  <FieldDescription>Used for session demo login.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ds-notes">Notes</FieldLabel>
                  <Textarea id="ds-notes" placeholder="Optional body…" rows={3} />
                </Field>
                <Field data-invalid>
                  <FieldLabel htmlFor="ds-err">With error</FieldLabel>
                  <Input id="ds-err" aria-invalid defaultValue="bad" />
                  <FieldError>VALIDATION_ERROR · field required</FieldError>
                </Field>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ds-alone">Standalone label</Label>
                  <Input id="ds-alone" className="max-w-xs" />
                </div>
              </FieldGroup>
            </DemoBox>
          </Section>

          {/* Feedback */}
          <Section
            id="feedback"
            title={m.dsFeedback}
            description="Badge, Avatar, Skeleton, Sonner toast"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <DemoBox title="Badge">
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="ghost">Ghost</Badge>
                </div>
              </DemoBox>
              <DemoBox title="Avatar + Skeleton">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>GX</AvatarFallback>
                  </Avatar>
                  <Avatar className="size-10">
                    <AvatarFallback>AD</AvatarFallback>
                  </Avatar>
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </DemoBox>
            </div>
            <DemoBox title="Toast (Sonner)">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.success('Success', { description: 'Action completed' })}
                >
                  <Check /> Success
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.error('Error', { description: 'Something failed' })}
                >
                  <AlertTriangle /> Error
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.message('Info', { description: 'Neutral toast' })}
                >
                  <Info /> Message
                </Button>
              </div>
            </DemoBox>
          </Section>

          {/* Overlays */}
          <Section
            id="overlays"
            title={m.dsOverlays}
            description="Dialog, Sheet, Dropdown, Tooltip"
          >
            <DemoBox>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDialogOpen(true)}>Open Dialog</Button>
                <Button variant="outline" onClick={() => setSheetOpen(true)}>
                  Open Sheet
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="secondary">Dropdown</Button>} />
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Copy /> Copy
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Settings /> Settings
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive">
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button variant="outline" size="icon-sm">
                        <Info />
                      </Button>
                    }
                  />
                  <TooltipContent>Tooltip content</TooltipContent>
                </Tooltip>
              </div>
            </DemoBox>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Dialog reference</DialogTitle>
                  <DialogDescription>
                    Modal pattern — create / confirm / settings.
                  </DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel htmlFor="dlg-title">Title</FieldLabel>
                  <Input id="dlg-title" placeholder="Example…" />
                </Field>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    {m.cancel}
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>{m.save}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Sheet reference</SheetTitle>
                  <SheetDescription>Slide-over for details / filters.</SheetDescription>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-3 px-4">
                  <Field>
                    <FieldLabel htmlFor="sheet-q">Search</FieldLabel>
                    <Input id="sheet-q" placeholder="Filter…" />
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    Use sheets for secondary workflows without leaving the page.
                  </p>
                </div>
                <SheetFooter>
                  <Button variant="outline" onClick={() => setSheetOpen(false)}>
                    {m.cancel}
                  </Button>
                  <Button onClick={() => setSheetOpen(false)}>Apply</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </Section>

          {/* Data — static UI Table (not TanStack) */}
          <Section
            id="data"
            title={m.dsData}
            description="UI Table shell, Card, ScrollArea, Separator (markup only)"
          >
            <DemoBox title="Table (UI shell only)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { name: 'hello kit', status: 'ok' },
                    { name: 'verify-kit', status: 'ok' },
                    { name: 'draft', status: 'pending' },
                  ].map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'ok' ? 'secondary' : 'outline'}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon-sm" variant="ghost">
                          <Trash2 className="text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DemoBox>
            <div className="grid gap-4 md:grid-cols-2">
              <DemoBox title="Card">
                <Card>
                  <CardHeader>
                    <CardTitle>Card title</CardTitle>
                    <CardDescription>Supporting description</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Primary surface for dashboards and forms.
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button size="sm">Primary</Button>
                    <Button size="sm" variant="outline">
                      Secondary
                    </Button>
                  </CardFooter>
                </Card>
              </DemoBox>
              <DemoBox title="ScrollArea">
                <ScrollArea className="h-40 rounded-lg border">
                  <div className="space-y-2 p-3">
                    {[
                      'alpha',
                      'bravo',
                      'charlie',
                      'delta',
                      'echo',
                      'foxtrot',
                      'golf',
                      'hotel',
                      'india',
                      'juliet',
                      'kilo',
                      'lima',
                    ].map((name, i) => (
                      <p key={name} className="text-sm">
                        Scroll item {i + 1} · {name}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground">Separator above</p>
              </DemoBox>
            </div>
          </Section>

          {/* TanStack headless dogfood */}
          <Section id="tanstack" title={m.dsTanstack} description={m.dsTanstackDesc}>
            <div className="grid gap-4">
              <DemoBox title="@tanstack/react-form + Zod">
                <form
                  className="flex max-w-md flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void tsForm.handleSubmit()
                  }}
                >
                  <tsForm.Field name="title">
                    {(field) => {
                      const err = field.state.meta.errors[0]
                      const invalid = Boolean(err)
                      return (
                        <Field data-invalid={invalid || undefined}>
                          <FieldLabel htmlFor="ts-title">{m.title}</FieldLabel>
                          <Input
                            id="ts-title"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            aria-invalid={invalid || undefined}
                            placeholder="Submit empty → validation"
                          />
                          {invalid ? <FieldError>{String(err)}</FieldError> : null}
                        </Field>
                      )
                    }}
                  </tsForm.Field>
                  <Button type="submit" size="sm" className="w-fit">
                    {m.submit}
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  Live forms also on /login and /app/notes.
                </p>
              </DemoBox>

              <DemoBox title="@tanstack/react-table + UI Table">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={tsSearch}
                    onChange={(e) => setTsSearch(e.target.value)}
                    placeholder={m.tableSearch}
                    className="sm:max-w-56"
                    aria-label={m.tableSearch}
                  />
                  <Select
                    items={tsStatusItems}
                    value={tsStatus}
                    onValueChange={(v) => {
                      if (v === 'all' || v === 'ok' || v === 'pending') setTsStatus(v)
                    }}
                  >
                    <SelectTrigger className="sm:w-36" aria-label={m.tableFilter}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {tsStatusItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    {tsTable.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => {
                          const canSort = header.column.getCanSort()
                          const sorted = header.column.getIsSorted()
                          return (
                            <TableHead key={header.id}>
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
                    {tsTable.getRowModel().rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          {m.tableNoResults}
                        </TableCell>
                      </TableRow>
                    ) : (
                      tsTable.getRowModel().rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Product list dogfood: /app/notes (sort + search + filter).
                </p>
              </DemoBox>

              <DemoBox title="@tanstack/markdown/react">
                <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border p-4">
                  <Markdown>{mdSample}</Markdown>
                </div>
              </DemoBox>
            </div>
          </Section>

          {/* Page templates */}
          <Section id="templates" title={m.dsTemplates} description={m.dsTemplatesDesc}>
            <div className="grid gap-6">
              {/* Template: login */}
              <DemoBox title="Template · Auth card">
                <div className="flex justify-center rounded-xl bg-muted/40 p-6">
                  <Card className="w-full max-w-sm shadow-sm">
                    <CardHeader>
                      <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                        GX
                      </div>
                      <CardTitle>{m.loginTitle}</CardTitle>
                      <CardDescription>{m.loginDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Field>
                        <FieldLabel htmlFor="tpl-email">{m.email}</FieldLabel>
                        <Input id="tpl-email" type="email" defaultValue="demo@gosilex.local" />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="tpl-pass">{m.password}</FieldLabel>
                        <Input id="tpl-pass" type="password" defaultValue="••••••••" />
                      </Field>
                      <Button className="w-full">{m.submit}</Button>
                    </CardContent>
                  </Card>
                </div>
              </DemoBox>

              {/* Template: empty state (Empty primitive) */}
              <DemoBox title="Template · Empty state">
                <Empty className="border border-dashed py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <LayoutTemplate className="size-4" aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>{m.empty}</EmptyTitle>
                    <EmptyDescription>{m.notesDesc}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm">
                      <Plus />
                      {m.createNote}
                    </Button>
                  </EmptyContent>
                </Empty>
              </DemoBox>

              {/* Select primitive */}
              <DemoBox title="Select">
                {(() => {
                  const items = [
                    { value: 'member', label: m.roleMember },
                    { value: 'reader', label: m.roleReader },
                    { value: 'admin', label: m.roleAdmin },
                  ]
                  return (
                    <Select items={items} defaultValue="member">
                      <SelectTrigger aria-label={m.inviteRole}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {items.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )
                })()}
              </DemoBox>

              {/* Template: settings */}
              <DemoBox title="Template · Settings panel">
                <Card className="max-w-lg">
                  <CardHeader>
                    <CardTitle className="text-base">{m.settings}</CardTitle>
                    <CardDescription>{m.settingsDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{m.appearance}</p>
                        <p className="text-xs text-muted-foreground">{m.themeSystem}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline">
                          {m.themeLight}
                        </Button>
                        <Button size="sm" variant="secondary">
                          {m.themeDark}
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{m.account}</p>
                        <p className="font-mono text-xs text-muted-foreground">user_demo · admin</p>
                      </div>
                      <Badge>admin</Badge>
                    </div>
                  </CardContent>
                </Card>
              </DemoBox>

              {/* Template: KPI dashboard */}
              <DemoBox title="Template · KPI grid">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: m.health, value: m.online },
                    { label: m.notes, value: '2' },
                    { label: m.session, value: 'user_demo' },
                  ].map((kpi) => (
                    <Card key={kpi.label}>
                      <CardHeader className="pb-2">
                        <CardDescription>{kpi.label}</CardDescription>
                        <CardTitle className="text-2xl tabular-nums">{kpi.value}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </DemoBox>

              {/* Template: data list actions */}
              <DemoBox title="Template · Data list + actions">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{m.notes}</CardTitle>
                      <CardDescription>{m.notesDesc}</CardDescription>
                    </div>
                    <Button size="sm">
                      <Plus />
                      {m.createNote}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{m.title}</TableHead>
                          <TableHead>{m.body}</TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">hello kit</TableCell>
                          <TableCell className="text-muted-foreground">smoke test</TableCell>
                          <TableCell>
                            <Button size="icon-sm" variant="ghost">
                              <Trash2 className="text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </DemoBox>
            </div>
          </Section>

          <p className="text-center text-xs text-muted-foreground">{m.designSystemFooter}</p>
        </div>
      </div>
    </div>
  )
}
