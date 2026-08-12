import { Button, Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Input } from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { isRateLimited, profileErrorMessage } from '../lib/account-errors'
import { apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'
import { safeInviteReturnPath, safePostAuthPath } from '../lib/safe-return-path'
import { magicLinkSchema } from '../lib/schemas'

/** Dev-only email prefill — BA tenancy staff (see seed tenancy-data). */
const DEV_DEMO_EMAIL = import.meta.env.DEV ? 'staff@kit.local' : ''

function magicCallbackURL(next: string | undefined): string {
  const origin = window.location.origin
  const safe = safePostAuthPath(next) ?? safeInviteReturnPath(next)
  if (safe) return `${origin}${safe}`
  return `${origin}/app`
}

type LoginMagicFormProps = {
  next: string | undefined
  onSent: () => void
}

/** Magic-link request form (B-magic #59) — enumeration-safe success. */
export function LoginMagicForm({ next, onSent }: LoginMagicFormProps) {
  const { m } = useLocale()

  const form = useForm({
    defaultValues: {
      email: DEV_DEMO_EMAIL,
    },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = magicLinkSchema.safeParse(value)
        if (parsed.success) return undefined
        return {
          form: m.errValidation,
          fields: {
            email: m.errEmailInvalid,
          },
        }
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await apiFetch('/api/auth/sign-in/magic-link', {
          method: 'POST',
          body: JSON.stringify({
            email: value.email,
            callbackURL: magicCallbackURL(next),
          }),
        })
      } catch (e) {
        // ApiError 429 / RATE_LIMITED or BA non-kit Error('HTTP 429')
        if (isRateLimited(e)) {
          toast.error(m.error, { description: profileErrorMessage(e, m) })
          return
        }
        // Other failures: still show generic success when possible (no enumeration)
      }
      onSent()
      toast.message(m.magicSentTitle, { description: m.magicSentDesc })
    },
  })

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
            const errId = `magic-${field.name}-error`
            const invalid = Boolean(err)
            return (
              <Field>
                <FieldLabel htmlFor={`magic-${field.name}`}>{m.email}</FieldLabel>
                <Input
                  id={`magic-${field.name}`}
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
                <FieldDescription>{m.magicHint}</FieldDescription>
              </Field>
            )
          }}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {m.magicSubmit}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}
