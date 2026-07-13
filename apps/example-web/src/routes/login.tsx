import {
  Button,
  cn,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'

const DEMO_EMAIL = 'demo@gosilex.local'
const DEMO_PASSWORD = 'demo-password-change-me'

/** login-05 chrome: centered brand + form (password + forgot, not email-only). */
export function LoginPage() {
  const { m, locale, setLocale } = useLocale()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const me = useMe()
  const demoPrefill = import.meta.env.DEV

  useEffect(() => {
    if (me.data) void navigate({ to: '/' })
  }, [me.data, navigate])

  const form = useForm({
    defaultValues: {
      email: demoPrefill ? DEMO_EMAIL : '',
      password: demoPrefill ? DEMO_PASSWORD : '',
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
        const msg = apiErrorToMessage(e, m.error)
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
              {(field) => (
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
                    required
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
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
                    required
                  />
                </Field>
              )}
            </form.Field>
            {demoPrefill ? <FieldDescription>{m.demoCreds}</FieldDescription> : null}
            {error ? <FieldError>{error}</FieldError> : null}
            <Button type="submit" className="w-full">
              {m.submit}
            </Button>
          </FieldGroup>
        </form>

        <p className="text-center text-xs text-balance text-muted-foreground">{m.loginLegal}</p>
      </div>
    </div>
  )
}
