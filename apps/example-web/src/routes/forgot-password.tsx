import { ForgotPasswordForm } from '@kit/auth/react'
import { Button, cn, LocaleSwitcher } from '@kit/ui'
import { Link } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { toast } from 'sonner'
import { profileErrorMessage } from '../lib/account-errors'
import { apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'

/**
 * Forgot-password UI — Better Auth request-password-reset (enumeration-safe).
 * Form lives in `@kit/auth/react`; this page owns chrome, i18n, and routing.
 */
export function ForgotPasswordPage() {
  const { m, locale, setLocale, locales } = useLocale()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <LocaleSwitcher
        className="absolute top-4 right-4"
        locales={locales}
        value={locale}
        onChange={setLocale}
      />

      <div className={cn('flex w-full max-w-sm flex-col gap-6')}>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-5" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">{m.forgotTitle}</h1>
          <p className="text-sm text-muted-foreground">{m.forgotDesc}</p>
        </div>

        <ForgotPasswordForm
          fetch={apiFetch}
          copy={m}
          resetRedirectTo={`${window.location.origin}/reset-password`}
          rateLimitedDescription={(e) => profileErrorMessage(e, m)}
          notify={{
            success: (title, description) => toast.success(title, { description }),
            error: (title, description) => toast.error(title, { description }),
            message: (title, description) => toast.message(title, { description }),
          }}
          loginLink={
            <Button variant="ghost" className="w-full" render={<Link to="/login" />}>
              {m.backToLogin}
            </Button>
          }
        />
      </div>
    </div>
  )
}
