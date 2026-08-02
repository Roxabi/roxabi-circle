import { Button, Field, FieldError, FieldGroup, FieldLabel, Input } from '@gosilex/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { accountErrorMessage } from '../lib/account-errors'
import { apiFetch } from '../lib/api'
import { meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { profileNameSchema } from '../lib/schemas'

export function AccountProfileForm() {
  const { m } = useLocale()
  const me = useMe()
  const qc = useQueryClient()

  const form = useForm({
    defaultValues: {
      name: me.data?.name ?? '',
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = profileNameSchema.safeParse(value)
        if (parsed.success) return undefined
        return {
          form: m.errValidation,
          fields: {
            name: m.profileNameRequired,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await apiFetch('/api/auth/update-user', {
          method: 'POST',
          body: JSON.stringify({ name: value.name.trim() }),
        })
        await qc.invalidateQueries({ queryKey: meQueryKey })
        toast.success(m.profileSaved)
      } catch (e) {
        toast.error(m.error, { description: accountErrorMessage(e, m) })
      }
    },
  })

  useEffect(() => {
    if (me.data?.name != null) {
      form.setFieldValue('name', me.data.name)
    }
  }, [me.data?.name, form])

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
        <form.Field name="name">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>{m.displayName}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                type="text"
                autoComplete="name"
                maxLength={80}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(ev) => field.handleChange(ev.target.value)}
              />
              <p className="text-xs text-muted-foreground">{m.displayNameHint}</p>
              {field.state.meta.errors[0] ? (
                <FieldError>{String(field.state.meta.errors[0])}</FieldError>
              ) : null}
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? m.loading : m.save}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
