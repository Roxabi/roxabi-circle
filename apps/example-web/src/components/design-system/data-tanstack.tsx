import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui'
import { Trash2 } from 'lucide-react'
import { useLocale } from '../../lib/locale'
import { DemoBox, Section } from './section'
import { TanstackSection } from './tanstack'

export function DataTanstack() {
  const { m } = useLocale()

  return (
    <>
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

      <TanstackSection />
    </>
  )
}
