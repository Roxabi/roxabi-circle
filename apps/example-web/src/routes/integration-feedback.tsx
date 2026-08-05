import { DEFAULT_PILOTAGE_URL } from '@kit/feedback'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
} from '@kit/ui'
import { useForm } from '@tanstack/react-form'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage } from '../lib/api'
import { useIntegration, useSaveIntegration } from '../lib/integrations'
import { useLocale } from '../lib/locale'

export function IntegrationFeedbackPage() {
  const { m } = useLocale()
  const integration = useIntegration('feedback')
  const save = useSaveIntegration('feedback')

  const form = useForm({
    defaultValues: {
      pilotageUrl: DEFAULT_PILOTAGE_URL,
      pilotageApiKey: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({
          pilotageUrl: value.pilotageUrl.trim(),
          pilotageApiKey: value.pilotageApiKey.trim() || undefined,
        })
        toast.success(m.integrationSaved)
        form.setFieldValue('pilotageApiKey', '')
      } catch (e) {
        toast.error(m.error, { description: apiErrorToMessage(e, m) })
      }
    },
  })

  useEffect(() => {
    const data = integration.data?.integration
    if (!data) return
    if (data.pilotageUrl) form.setFieldValue('pilotageUrl', data.pilotageUrl)
  }, [integration.data?.integration, form])

  const preview = integration.data?.integration.apiKeyPreview

  return (
    <div>
      <PageHeader
        title={m.integrationFeedbackTitle}
        description={m.integrationFeedbackDesc}
        actions={
          <Button render={<Link to="/admin" />} variant="outline" size="sm">
            {m.backToSettings}
          </Button>
        }
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">{m.integrationFeedbackFormTitle}</CardTitle>
          <CardDescription>{m.integrationFeedbackFormDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field name="pilotageUrl">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.integrationPilotageUrl}</FieldLabel>
                    <Input
                      id={field.name}
                      type="url"
                      placeholder={DEFAULT_PILOTAGE_URL}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldDescription>{m.integrationPilotageUrlHint}</FieldDescription>
                  </Field>
                )}
              </form.Field>

              <form.Field name="pilotageApiKey">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.integrationPilotageApiKey}</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      autoComplete="off"
                      placeholder={preview ? m.integrationPilotageApiKeyKeep : 'fbk_…'}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {preview ? (
                      <FieldDescription>
                        {m.integrationPilotageApiKeyCurrent}:{' '}
                        <code className="font-mono text-xs">{preview}</code>
                      </FieldDescription>
                    ) : (
                      <FieldDescription>{m.integrationPilotageApiKeyHint}</FieldDescription>
                    )}
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting || save.isPending}>
                    {m.save}
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
