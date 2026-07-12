import type { LabelHTMLAttributes } from 'react'
import { cn } from './cn'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // Consumers pass htmlFor; reusable primitive cannot wrap the input.
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor supplied by call sites
    <label
      className={cn(
        'text-sm font-medium leading-none text-zinc-700 peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
}
