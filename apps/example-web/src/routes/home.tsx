import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError, apiFetch } from '../lib/api'
import { defaultLocale, type Locale, t } from '../lib/i18n'

type Note = { id: string; title: string; body: string; createdAt: number }

export function HomePage() {
  const [locale, setLocale] = useState<Locale>(defaultLocale)
  const m = t(locale)
  const qc = useQueryClient()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean; requestId: string }>('/health'),
  })

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<{ subject: string; authMethod: string; requestId: string }>('/api/me'),
    retry: false,
  })

  const notes = useQuery({
    queryKey: ['notes'],
    queryFn: () => apiFetch<{ notes: Note[] }>('/api/notes'),
    enabled: !!me.data,
    retry: false,
  })

  const createNote = useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notes'] }),
  })

  const sendEmail = useMutation({
    mutationFn: () => apiFetch('/api/demo/email', { method: 'POST', body: '{}' }),
  })

  const form = useForm({
    defaultValues: { title: '', body: '' },
    onSubmit: async ({ value, formApi }) => {
      await createNote.mutateAsync(value)
      formApi.reset()
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{m.appTitle}</h1>
          <p className="text-sm text-zinc-500">{m.logoutHint}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{m.lang}</span>
          <button type="button" className="underline" onClick={() => setLocale('fr')}>
            FR
          </button>
          <button type="button" className="underline" onClick={() => setLocale('en')}>
            EN
          </button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{m.health}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {health.isLoading ? '…' : null}
          {health.data ? (
            <pre className="overflow-x-auto rounded bg-zinc-100 p-3 text-xs">
              {JSON.stringify(health.data, null, 2)}
            </pre>
          ) : null}
          {health.error ? <p className="text-red-600">{String(health.error)}</p> : null}
        </CardContent>
      </Card>

      {!me.data ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="text-sm text-zinc-600">{m.login}</p>
            <Link to="/login">
              <Button>{m.login}</Button>
            </Link>
            {me.error instanceof ApiError ? (
              <p className="text-xs text-zinc-500">
                {me.error.code} · {me.error.requestId}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{m.me}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <pre className="overflow-x-auto rounded bg-zinc-100 p-3 text-xs">
                {JSON.stringify(me.data, null, 2)}
              </pre>
              <Button
                variant="outline"
                onClick={() => sendEmail.mutate()}
                disabled={sendEmail.isPending}
              >
                {m.sendEmail}
              </Button>
              {sendEmail.data ? (
                <pre className="overflow-x-auto rounded bg-zinc-100 p-3 text-xs">
                  {JSON.stringify(sendEmail.data, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.notes}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void form.handleSubmit()
                }}
              >
                <form.Field name="title">
                  {(field) => (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={field.name}>{m.title}</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="body">
                  {(field) => (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={field.name}>{m.body}</Label>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    </div>
                  )}
                </form.Field>
                <Button type="submit" disabled={createNote.isPending}>
                  {m.createNote}
                </Button>
              </form>

              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
                {(notes.data?.notes ?? []).length === 0 ? (
                  <li className="p-4 text-sm text-zinc-500">{m.empty}</li>
                ) : (
                  (notes.data?.notes ?? []).map((n) => (
                    <li key={n.id} className="p-4 text-sm">
                      <div className="font-medium">{n.title}</div>
                      <div className="text-zinc-500">{n.body}</div>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
