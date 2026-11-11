/**
 * Mounts the overlays section patterns used by the design system page
 * (Dropdown/Dialog/Sheet/Tooltip) and fails if Base UI context contracts break.
 */
import {
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

describe('design-system overlays contracts', () => {
  it('dropdown with Group + Label opens without Base UI MenuGroupContext error', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button>Dropdown</Button>} />
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem>Copy</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    await user.click(screen.getByRole('button', { name: 'Dropdown' }))
    expect(await screen.findByText('Actions')).toBeInTheDocument()
  })

  it('dialog + sheet + tooltip stack mounts without contract errors', () => {
    render(
      <TooltipProvider>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog reference</DialogTitle>
              <DialogDescription>Modal pattern</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet open onOpenChange={() => {}}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Sheet reference</SheetTitle>
              <SheetDescription>Slide-over</SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <Button type="button">Apply</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Tooltip>
          <TooltipTrigger render={<Button type="button">Tip</Button>} />
          <TooltipContent>Help</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    expect(screen.getByText('Dialog reference')).toBeInTheDocument()
    expect(screen.getByText('Sheet reference')).toBeInTheDocument()
  })
})
