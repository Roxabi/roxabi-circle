import { Button, Field, FieldError, FieldGroup, FieldLabel, Input } from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { toast } from 'sonner'
import { changePasswordErrorMessage } from '../lib/account-errors'
import { apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'
import { changePasswordSchema } from '../lib/schemas'

export function AccountPasswordForm() {
  const { m } = useLocale()
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true)

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirm: '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = changePasswordSchema.safeParse(value)
        if (parsed.success) return undefined
        const flat = parsed.error.flatten().fieldErrors
        return {
          form: m.errValidation,
          fields: {
            currentPassword: flat.currentPassword?.[0]
              ? m.changePasswordCurrentRequired
              : undefined,
            newPassword: flat.newPassword?.[0] ? m.changePasswordTooShort : undefined,
            confirm: flat.confirm?.[0] ? m.changePasswordMismatch : undefined,
          },
        }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        // Better Auth change-password — discard any token in response body (never display).
        await apiFetch('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: value.currentPassword,
            newPassword: value.newPassword,
            revokeOtherSessions,
          }),
        })
        toast.success(m.changePasswordSuccess)
        formApi.reset()
        setRevokeOtherSessions(true)
      } catch (e) {
        const msg = changePasswordErrorMessage(e, m)
        toast.error(m.error, { description: msg })
        // Keep current; clear new+confirm only (spec edge policy).
        formApi.setFieldValue('newPassword', '')
        formApi.setFieldValue('confirm', '')
      }
    },
  })

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="currentPassword">
          {(field) => {
            const err = field.state.meta.errors[0]
            const invalid = Boolean(err)
            const errId = `${field.name}-error`
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>{m.changePasswordCurrent}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(ev) => field.handleChange(ev.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errId : undefined}
                />
                {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
              </Field>
            )
          }}
        </form.Field>
        <form.Field name="newPassword">
          {(field) => {
            const err = field.state.meta.errors[0]
            const invalid = Boolean(err)
            const errId = `${field.name}-error`
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>{m.changePasswordNew}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(ev) => field.handleChange(ev.target.value)}
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
            const invalid = Boolean(err)
            const errId = `${field.name}-error`
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>{m.changePasswordConfirm}</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(ev) => field.handleChange(ev.target.value)}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? errId : undefined}
                />
                {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={revokeOtherSessions}
          onChange={(ev) => setRevokeOtherSessions(ev.target.checked)}
        />
        <span>{m.changePasswordRevokeOthers}</span>
      </label>

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? m.loading : m.changePasswordSubmit}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
