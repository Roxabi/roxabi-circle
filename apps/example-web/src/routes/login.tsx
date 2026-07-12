import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, apiFetch } from '../lib/api'
import { meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'

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
      email: 'demo@gosilex.local',
      password: 'demo-password-change-me',
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
        if (e instanceof ApiError) {
          setError(`${e.code}: ${e.message}`)
          toast.error(m.error, { description: e.message })
        } else {
          setError(String(e))
        }
      }
    },
  })

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--muted),transparent_55%),radial-gradient(ellipse_at_bottom_right,var(--accent),transparent_50%)]"
      />
      <Card className="relative w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              GX
            </div>
            <div className="flex gap-1">
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
          </div>
          <div>
            <CardTitle>{m.loginTitle}</CardTitle>
            <CardDescription className="mt-1.5">{m.loginDesc}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <form.Field name="email">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{m.email}</FieldLabel>
                  <Input
                    id={field.name}
                    type="email"
                    autoComplete="username"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{m.password}</FieldLabel>
                  <Input
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Field>
              )}
            </form.Field>
            <FieldDescription>{m.demoCreds}</FieldDescription>
            {error ? <FieldError>{error}</FieldError> : null}
            <Button type="submit" className="w-full">
              {m.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
