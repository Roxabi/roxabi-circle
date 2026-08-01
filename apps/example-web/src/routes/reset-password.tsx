import { Button, cn, Field, FieldError, FieldGroup, FieldLabel, Input } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { defaultHomePath, type MeResponse } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { safePostAuthPath } from '../lib/safe-return-path'
import { resetPasswordSchema } from '../lib/schemas'

/**
 * Complete password reset with BA token from email callback / query.
 * Token is captured into state then stripped from the URL (history/replace).
 */
export function ResetPasswordPage() {
  const { m, locale, setLocale } = useLocale()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as {
    token?: string
    error?: string
    next?: string
  }
  const stripped = useRef(false)
  // Seed from search on first paint so strip replace does not flash "missing token".
  const [token, setToken] = useState(() => search.token?.trim() ?? '')
  const [nextPath, setNextPath] = useState(() => safePostAuthPath(search.next) ?? '')
  const [linkError, setLinkError] = useState(() => search.error?.trim() || undefined)

  useEffect(() => {
    if (stripped.current) return
    const t = search.token?.trim() ?? ''
    const err = search.error?.trim()
    const next = safePostAuthPath(search.next)
    if (t && t !== token) setToken(t)
    if (next) setNextPath(next)
    if (err) setLinkError(err)
    if (search.token || search.error || search.next) {
      stripped.current = true
      void navigate({
        to: '/reset-password',
        search: { token: undefined, error: undefined, next: undefined },
        replace: true,
      })
    }
  }, [search.token, search.error, search.next, navigate, token])

  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = resetPasswordSchema.safeParse(value)
        if (parsed.success) return undefined
        const flat = parsed.error.flatten().fieldErrors
        return {
          form: m.errValidation,
          fields: {
            password: flat.password?.[0] ? m.resetPasswordTooShort : undefined,
            confirm: flat.confirm?.[0] ? m.resetPasswordMismatch : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error(m.error, { description: m.resetPasswordMissingToken })
        return
      }
      try {
        await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ newPassword: value.password, token }),
        })
        toast.success(m.resetPasswordSuccess)
        // First-login / welcome: prefer safe next, else session home, else login
        const preferred = safePostAuthPath(nextPath)
        if (preferred?.startsWith('/invite/accept')) {
          window.location.assign(preferred)
          return
        }
        try {
          // BA may auto-session after reset; try me for plane home
          const me = await apiFetch<MeResponse>('/api/me')
          const home =
            preferred === '/app' || preferred === '/admin' ? preferred : defaultHomePath(me)
          await navigate({ to: home })
          return
        } catch {
          await navigate({ to: '/login' })
        }
      } catch (e) {
        toast.error(m.error, { description: apiErrorToMessage(e, m) })
      }
    },
  })

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="absolute top-4 right-4 flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={locale === 'fr' ? 'secondary' : 'ghost'}
          onClick={() => setLocale('fr')}
        >
          FR
        </Button>
        <Button
          type="button"
          size="sm"
          variant={locale === 'en' ? 'secondary' : 'ghost'}
          onClick={() => setLocale('en')}
        >
          EN
        </Button>
      </div>

      <div className={cn('flex w-full max-w-sm flex-col gap-6')}>
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-5" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">{m.resetPasswordTitle}</h1>
          <p className="text-sm text-muted-foreground">{m.resetPasswordDesc}</p>
        </div>

        {linkError || !token ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              {linkError ? m.resetPasswordInvalidLink : m.resetPasswordMissingToken}
            </p>
            <Button variant="outline" render={<Link to="/forgot-password" />}>
              {m.forgotPassword}
            </Button>
            <Button variant="ghost" render={<Link to="/login" />}>
              {m.backToLogin}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="password">
                {(field) => {
                  const err = field.state.meta.errors[0]
                  const errId = `${field.name}-error`
                  const invalid = Boolean(err)
                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{m.resetPasswordNew}</FieldLabel>
                      <Input
                        id={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? errId : undefined}
                      />
                      {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                    </Field>
                  )
                }}
              </form.Field>
              <form.Field name="confirm">
                {(field) => {
                  const err = field.state.meta.errors[0]
                  const errId = `${field.name}-error`
                  const invalid = Boolean(err)
                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{m.resetPasswordConfirm}</FieldLabel>
                      <Input
                        id={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? errId : undefined}
                      />
                      {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                    </Field>
                  )
                }}
              </form.Field>
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {m.resetPasswordSubmit}
                  </Button>
                )}
              </form.Subscribe>
              <Button variant="ghost" className="w-full" render={<Link to="/login" />}>
                {m.backToLogin}
              </Button>
            </FieldGroup>
          </form>
        )}
      </div>
    </div>
  )
}
