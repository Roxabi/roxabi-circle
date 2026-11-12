import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
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
  Field,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kit/ui'
import { AlertTriangle, Check, Copy, Info, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '../../lib/locale'
import { DemoBox, Section } from './section'

export function FeedbackOverlays() {
  const { m } = useLocale()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
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
      <Section id="overlays" title={m.dsOverlays} description="Dialog, Sheet, Dropdown, Tooltip">
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
              <DialogDescription>Modal pattern — create / confirm / settings.</DialogDescription>
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
    </>
  )
}
