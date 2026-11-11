import { Button } from '@kit/ui'
import { apiErrorToMessage } from '../../lib/api'
import { denialFromError } from '../../lib/flows'
import { useLocale } from '../../lib/locale'

export function FlowsQueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { m } = useLocale()
  const denial = denialFromError(error)
  const title =
    denial === 'not_found' ? m.errNotFound : denial === 'forbidden' ? m.errForbidden : m.loadFailed
  return (
    <div
      role="alert"
      data-denial={denial ?? 'error'}
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-12 text-center"
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      {denial ? null : (
        <p className="max-w-sm text-xs text-muted-foreground">{apiErrorToMessage(error, m)}</p>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        {m.retry}
      </Button>
    </div>
  )
}
