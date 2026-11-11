'use client'

import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type DatePickerProps = {
  value?: Date | null
  onChange?: (date: Date | undefined) => void
  /** App-owned i18n string — kit has no product locale. */
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  /** date-fns format string for the trigger label. Default PPP. */
  displayFormat?: string
  align?: 'start' | 'center' | 'end'
}

/**
 * Composition: Popover + Calendar (shadcn has no standalone date-picker registry item for base-nova).
 * Controlled by default when `value` / `onChange` are provided.
 */
function DatePicker({
  value = null,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  id,
  className,
  displayFormat = 'PPP',
  align = 'start',
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = value ?? undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        render={
          <Button
            variant="outline"
            data-slot="date-picker-trigger"
            className={cn(
              'w-full min-w-[12rem] justify-start text-left font-normal',
              !selected && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-4 opacity-60" />
        {selected ? format(selected, displayFormat) : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date: Date | undefined) => {
            onChange?.(date)
            setOpen(false)
          }}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
