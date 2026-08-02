import { Button, cn, Field, FieldError, FieldGroup, FieldLabel, Input } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoginMagicForm } from '../components/login-magic-form'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { defaultHomePath, type MeResponse, meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { safeInviteReturnPath } from '../lib/safe-return-path'
import { loginSchema } from '../lib/schemas'

/** Dev-only email prefill — BA tenancy staff (see seed tenancy-data). */
const DEV_DEMO_EMAIL = import.meta.env.DEV ? 'staff@gosilex.local' : ''

type LoginMode = 'password' | 'magic'

function postLoginTarget(me: MeResponse, next: string | undefined): string {
  return safeInviteReturnPath(next) ?? defaultHomePath(me)
}

/** login-05 chrome: centered brand + Password | Magic link modes. */
export function LoginPage() {
  const { m, locale, setLocale } = useLocale()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<LoginMode>('password')
  const [magicSent, setMagicSent] = useState(false)
  const me = useMe()

  useEffect(() => {
    if (!me.data) return
    const target = postLoginTarget(me.data, search.next)
    void navigate({ href: target })
  }, [me.data, navigate, search.next])

  const passwordForm = useForm({
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
        // Better Auth only (ADR-0002)
        await apiFetch('/api/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify({ email: value.email, password: value.password }),
        })
        await qc.invalidateQueries({ queryKey: meQueryKey })
        const meAfter = await qc.fetchQuery({
          queryKey: meQueryKey,
          queryFn: () => apiFetch<MeResponse>('/api/me'),
        })
        toast.success(m.login, { description: value.email })
        const target = postLoginTarget(meAfter, search.next)
        await navigate({ href: target })
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

        <fieldset className="m-0 grid grid-cols-2 gap-1 rounded-lg border p-1">
          <legend className="sr-only">{m.loginTitle}</legend>
          <Button
            type="button"
            size="sm"
            aria-pressed={mode === 'password'}
            variant={mode === 'password' ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode('password')
              setError(null)
            }}
          >
            {m.loginModePassword}
          </Button>
          <Button
            type="button"
            size="sm"
            aria-pressed={mode === 'magic'}
            variant={mode === 'magic' ? 'secondary' : 'ghost'}
            onClick={() => {
              setMode('magic')
              setError(null)
              setMagicSent(false)
            }}
          >
            {m.loginModeMagic}
          </Button>
        </fieldset>

        {mode === 'password' ? (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void passwordForm.handleSubmit()
            }}
          >
            <FieldGroup>
              <passwordForm.Field name="email">
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
              </passwordForm.Field>
              <passwordForm.Field name="password">
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
              </passwordForm.Field>
              {error ? <FieldError>{error}</FieldError> : null}
              <passwordForm.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {m.submit}
                  </Button>
                )}
              </passwordForm.Subscribe>
            </FieldGroup>
          </form>
        ) : magicSent ? (
          <div className="flex flex-col gap-4 text-center" role="status">
            <p className="text-sm font-medium">{m.magicSentTitle}</p>
            <p className="text-sm text-muted-foreground">{m.magicSentDesc}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMagicSent(false)
              }}
            >
              {m.backToLogin}
            </Button>
          </div>
        ) : (
          <LoginMagicForm next={search.next} onSent={() => setMagicSent(true)} />
        )}

        <p className="text-center text-xs text-balance text-muted-foreground">{m.loginLegal}</p>
      </div>
    </div>
  )
}
