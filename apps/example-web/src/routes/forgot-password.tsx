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
import { Link } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useLocale } from '../lib/locale'
import { forgotPasswordSchema } from '../lib/schemas'

/**
 * Forgot-password UI (login-05 chrome).
 * Backend reset/magic-link ships with Better Auth (M3) — UI is ready, submit is a stub.
 */
export function ForgotPasswordPage() {
  const { m, locale, setLocale } = useLocale()
  const [sent, setSent] = useState(false)

  const form = useForm({
    defaultValues: { email: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = forgotPasswordSchema.safeParse(value)
        if (parsed.success) return undefined
        return {
          form: m.errValidation,
          fields: {
            email: m.errEmailInvalid,
          },
        }
      },
    },
    onSubmit: async () => {
      // Stub until Better Auth password reset (issue #12)
      setSent(true)
      toast.message(m.forgotSentTitle, { description: m.forgotSentDesc })
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
          <h1 className="text-xl font-bold">{m.forgotTitle}</h1>
          <p className="text-sm text-muted-foreground">{m.forgotDesc}</p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-muted-foreground">{m.forgotSentDesc}</p>
            <Button variant="outline" render={<Link to="/login" />}>
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
                        autoComplete="email"
                        placeholder="m@example.com"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={invalid || undefined}
                        aria-describedby={invalid ? errId : undefined}
                      />
                      <FieldDescription>{m.forgotEmailHint}</FieldDescription>
                      {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
                    </Field>
                  )
                }}
              </form.Field>
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {m.forgotSubmit}
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
