import type { VariantProps } from 'class-variance-authority'
import { CheckIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, type buttonVariants } from './button'
import { DropdownMenuItem } from './dropdown-menu'

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export type LocaleSwitcherProps<L extends string> = {
  locales: readonly L[]
  value: L
  onChange: (locale: L) => void
  /** `buttons` = auth/settings chips. `menu` = items for a kit dropdown. */
  variant?: 'buttons' | 'menu'
  /** Native names (Français). Default: locale code uppercased (FR). */
  labels?: Partial<Record<L, string>>
  className?: string
  size?: ButtonSize
  activeVariant?: ButtonVariant
  inactiveVariant?: ButtonVariant
}

/**
 * Locale chrome. Renders nothing when `locales.length <= 1` (product mono-langue).
 * Copy stays app-owned via `labels`; kit never ships FR/EN strings.
 */
export function LocaleSwitcher<L extends string>({
  locales,
  value,
  onChange,
  variant = 'buttons',
  labels,
  className,
  size = 'sm',
  activeVariant = 'secondary',
  inactiveVariant = 'ghost',
}: LocaleSwitcherProps<L>) {
  if (locales.length <= 1) return null

  const labelOf = (locale: L) => labels?.[locale] ?? locale.toUpperCase()

  if (variant === 'menu') {
    return (
      <>
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} data-locale={locale} onClick={() => onChange(locale)}>
            {locale === value ? <CheckIcon /> : null}
            {labelOf(locale)}
          </DropdownMenuItem>
        ))}
      </>
    )
  }

  return (
    <div className={cn('flex gap-1', className)} data-slot="locale-switcher">
      {locales.map((locale) => (
        <Button
          key={locale}
          type="button"
          size={size}
          variant={locale === value ? activeVariant : inactiveVariant}
          aria-pressed={locale === value}
          onClick={() => onChange(locale)}
        >
          {labelOf(locale)}
        </Button>
      ))}
    </div>
  )
}
