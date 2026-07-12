import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError, apiFetch } from '../lib/api'
import { defaultLocale, type Locale, t } from '../lib/i18n'

export function LoginPage() {
  const navigate = useNavigate()
  const [locale, setLocale] = useState<Locale>(defaultLocale)
  const [error, setError] = useState<string | null>(null)
  const m = t(locale)

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
        await navigate({ to: '/' })
      } catch (e) {
        if (e instanceof ApiError) setError(`${e.code}: ${e.message} (${e.requestId})`)
        else setError(String(e))
      }
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{m.login}</CardTitle>
        <div className="flex gap-2 text-sm">
          <span className="text-zinc-500">{m.lang}</span>
          <button type="button" className="underline" onClick={() => setLocale('fr')}>
            FR
          </button>
          <button type="button" className="underline" onClick={() => setLocale('en')}>
            EN
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-zinc-500">{m.demoCreds}</p>
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.email}</Label>
                <Input
                  id={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{m.password}</Label>
                <Input
                  id={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {m.error}: {error}
            </p>
          ) : null}
          <Button type="submit">{m.submit}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
