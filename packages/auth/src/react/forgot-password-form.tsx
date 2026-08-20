import { Button, Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Input } from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { type ReactNode, useState } from 'react'
import { AUTH_REQUEST_PASSWORD_RESET_PATH, forgotPasswordSchema } from '../password-schemas'
import { isRateLimited } from './errors'
import { type AuthFormFetch, type AuthFormNotify, silentNotify } from './notify'

export type ForgotPasswordCopy = {
  email: string
  errEmailInvalid: string
  errValidation: string
  forgotSubmit: string
  forgotEmailHint: string
  forgotSentTitle: string
  forgotSentDesc: string
  error: string
}

export function ForgotPasswordForm({
  fetch: authFetch,
  copy,
  resetRedirectTo,
  notify = silentNotify,
  loginLink,
  rateLimitedDescription,
}: {
  fetch: AuthFormFetch
  copy: ForgotPasswordCopy
  /** Absolute URL Better Auth puts in the reset email (SPA `/reset-password`). */
  resetRedirectTo: string
  notify?: AuthFormNotify
  loginLink?: ReactNode
  rateLimitedDescription?: (err: unknown) => string
}) {
  const [sent, setSent] = useState(false)
  const form = useForm({
    defaultValues: { email: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = forgotPasswordSchema.safeParse(value)
        if (parsed.success) return undefined
        return { form: copy.errValidation, fields: { email: copy.errEmailInvalid } }
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await authFetch(AUTH_REQUEST_PASSWORD_RESET_PATH, {
          method: 'POST',
          body: JSON.stringify({ email: value.email, redirectTo: resetRedirectTo }),
        })
      } catch (e) {
        if (isRateLimited(e)) {
          notify.error(copy.error, rateLimitedDescription?.(e))
          return
        }
      }
      setSent(true)
      notify.message(copy.forgotSentTitle, copy.forgotSentDesc)
    },
  })

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-sm text-muted-foreground">{copy.forgotSentDesc}</p>
        {loginLink}
      </div>
    )
  }

  return (
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
                <FieldLabel htmlFor={field.name}>{copy.email}</FieldLabel>
                <Input
                  id={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(ev) => field.handleChange(ev.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errId : undefined}
                />
                <FieldDescription>{copy.forgotEmailHint}</FieldDescription>
                {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
              </Field>
            )
          }}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {copy.forgotSubmit}
            </Button>
          )}
        </form.Subscribe>
        {loginLink}
      </FieldGroup>
    </form>
  )
}
