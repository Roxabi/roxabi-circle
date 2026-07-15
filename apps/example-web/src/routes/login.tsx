import { Button, cn, Field, FieldError, FieldGroup, FieldLabel, Input } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { loginSchema } from '../lib/schemas'

/** Dev-only email prefill — password shown in env banner via GET /health (API dev|test only). */
const DEV_DEMO_EMAIL = import.meta.env.DEV ? 'demo@gosilex.local' : ''

/** login-05 chrome: centered brand + form (password + forgot, not email-only). */
export function LoginPage() {
  const { m, locale, setLocale } = useLocale()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const me = useMe()

  useEffect(() => {
    if (me.data) void navigate({ to: '/' })
  }, [me.data, navigate])

  const form = useForm({
    defaultValues: {
      email: DEV_DEMO_EMAIL,
      password: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = loginSchema.safeParse(value)
        if (parsed.success) return undefined
        const flat = parsed.error.flatten().fieldErrors
        return {
          form: m.errValidation,
          fields: {
            email: flat.email?.[0] ? m.errEmailInvalid : undefined,
            password: flat.password?.[0] ? m.errPasswordRequired : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(value),
        })
        await qc.invalidateQueries({ queryKey: meQueryKey })
        toast.success(m.login, { description: value.email })
        await navigate({ to: '/' })
      } catch (e) {
        const msg = apiErrorToMessage(e, m)
        setError(msg)
        toast.error(m.error, { description: msg })
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
          <h1 className="text-xl font-bold">{m.welcomeTitle}</h1>
          <p className="text-sm text-muted-foreground">{m.loginDesc}</p>
        </div>

        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="email">
              {(field) => {
                const err = field.state.meta.errors[0]
                const errId = `${field.name}-error`
                const invalid = Boolean(err)
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.email}</FieldLabel>
                    <Input
                      id={field.name}
                      type="email"
                      autoComplete="username"
                      placeholder="m@example.com"
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
            <form.Field name="password">
              {(field) => {
                const err = field.state.meta.errors[0]
                const errId = `${field.name}-error`
                const invalid = Boolean(err)
                return (
                  <Field>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor={field.name}>{m.password}</FieldLabel>
                      <Link
                        to="/forgot-password"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        {m.forgotPassword}
                      </Link>
                    </div>
                    <Input
                      id={field.name}
                      type="password"
                      autoComplete="current-password"
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
            {error ? <FieldError>{error}</FieldError> : null}
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {m.submit}
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>

        <p className="text-center text-xs text-balance text-muted-foreground">{m.loginLegal}</p>
      </div>
    </div>
  )
}
