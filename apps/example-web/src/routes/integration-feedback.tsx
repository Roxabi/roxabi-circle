import { DEFAULT_SPARK_URL } from '@gosilex/feedback'
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
} from '@gosilex/ui'
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
      sparkUrl: DEFAULT_SPARK_URL,
      sparkApiKey: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({
          sparkUrl: value.sparkUrl.trim(),
          sparkApiKey: value.sparkApiKey.trim() || undefined,
        })
        toast.success(m.integrationSaved)
        form.setFieldValue('sparkApiKey', '')
      } catch (e) {
        toast.error(m.error, { description: apiErrorToMessage(e, m) })
      }
    },
  })

  useEffect(() => {
    const data = integration.data?.integration
    if (!data) return
    if (data.sparkUrl) form.setFieldValue('sparkUrl', data.sparkUrl)
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
              <form.Field name="sparkUrl">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.integrationSparkUrl}</FieldLabel>
                    <Input
                      id={field.name}
                      type="url"
                      placeholder={DEFAULT_SPARK_URL}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <FieldDescription>{m.integrationSparkUrlHint}</FieldDescription>
                  </Field>
                )}
              </form.Field>

              <form.Field name="sparkApiKey">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{m.integrationSparkApiKey}</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      autoComplete="off"
                      placeholder={preview ? m.integrationSparkApiKeyKeep : 'spk_…'}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {preview ? (
                      <FieldDescription>
                        {m.integrationSparkApiKeyCurrent}:{' '}
                        <code className="font-mono text-xs">{preview}</code>
                      </FieldDescription>
                    ) : (
                      <FieldDescription>{m.integrationSparkApiKeyHint}</FieldDescription>
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
