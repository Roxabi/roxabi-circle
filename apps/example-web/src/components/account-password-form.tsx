import { ChangePasswordForm } from '@kit/auth/react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { useLocale } from '../lib/locale'

export function AccountPasswordForm() {
  const { m } = useLocale()
  return (
    <ChangePasswordForm
      fetch={apiFetch}
      copy={m}
      fallbackError={(err) => apiErrorToMessage(err, m)}
      notify={{
        success: (title, description) => toast.success(title, { description }),
        error: (title, description) => toast.error(title, { description }),
        message: (title, description) => toast.message(title, { description }),
      }}
    />
  )
}
