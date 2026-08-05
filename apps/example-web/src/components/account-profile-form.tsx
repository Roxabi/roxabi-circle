import { Button, Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Input } from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { profileErrorMessage } from '../lib/account-errors'
import { apiFetch } from '../lib/api'
import { meQueryKey, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { profileNameSchema } from '../lib/schemas'

export function AccountProfileForm() {
  const { m } = useLocale()
  const me = useMe()
  const qc = useQueryClient()
  const seededRef = useRef(false)

  const form = useForm({
    defaultValues: {
      name: '',
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
        toast.error(m.error, { description: profileErrorMessage(e, m) })
      }
    },
  })

  // Seed once when /api/me first resolves — do not overwrite dirty input on refetch.
  useEffect(() => {
    if (seededRef.current) return
    if (me.isLoading || me.isFetching) return
    if (me.data === undefined && !me.isError) return
    form.setFieldValue('name', me.data?.name ?? '')
    seededRef.current = true
  }, [me.data, me.isLoading, me.isFetching, me.isError, form])

  const hintId = 'profile-name-hint'

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
          {(field) => {
            const err = field.state.meta.errors[0]
            const invalid = Boolean(err)
            const errId = `${field.name}-error`
            const describedBy = invalid ? `${hintId} ${errId}` : hintId
            return (
              <Field data-invalid={invalid || undefined}>
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
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                />
                <FieldDescription id={hintId}>{m.displayNameHint}</FieldDescription>
                {invalid ? <FieldError id={errId}>{String(err)}</FieldError> : null}
              </Field>
            )
          }}
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
