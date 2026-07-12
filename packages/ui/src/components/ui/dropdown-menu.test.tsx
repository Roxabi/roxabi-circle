import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { assertNoBaseUiContractErrors, captureRuntimeErrors } from '../../test/capture-errors'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'

describe('DropdownMenu (Base UI contracts)', () => {
  it('throws / reports when DropdownMenuLabel is used outside DropdownMenuGroup', () => {
    const errors = captureRuntimeErrors(() => {
      render(
        <DropdownMenu open>
          <DropdownMenuTrigger render={<Button>Open</Button>} />
          <DropdownMenuContent>
            <DropdownMenuLabel>Broken label</DropdownMenuLabel>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      )
    })

    const hit = errors.some((e) => /MenuGroupContext|Menu\.Group|RadioGroup/i.test(e.message))
    expect(hit).toBe(true)
  })

  it('opens without Base UI context errors when Label is inside Group', async () => {
    const user = userEvent.setup()
    const errors = captureRuntimeErrors(() => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button>Open menu</Button>} />
          <DropdownMenuContent>
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
    })
    assertNoBaseUiContractErrors(errors)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(await screen.findByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })
})
