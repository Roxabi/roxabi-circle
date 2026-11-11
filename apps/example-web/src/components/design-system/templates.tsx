import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui'
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { useLocale } from '../../lib/locale'
import { DemoBox, Section } from './section'

export function Templates() {
  const { m } = useLocale()

  return (
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
                  <Input id="tpl-email" type="email" defaultValue="demo@kit.local" />
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
  )
}
