import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Separator,
} from '@gosilex/ui'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { PageHeader } from '../components/app-shell'
import { apiErrorToMessage } from '../lib/api'
import { isAdmin, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { getModuleState, useModules, useSetModuleEnabled } from '../lib/modules'
import { type Theme, useTheme } from '../lib/theme'

export function SettingsPage() {
  const { m, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const me = useMe()
  const modules = useModules({ enabled: isAdmin(me.data) })
  const setModule = useSetModuleEnabled()
  const feedback = getModuleState(modules.data?.modules, 'feedback')

  const themes: { id: Theme; label: string }[] = [
    { id: 'light', label: m.themeLight },
    { id: 'dark', label: m.themeDark },
    { id: 'system', label: m.themeSystem },
  ]

  return (
    <div>
      <PageHeader title={m.settings} description={m.settingsDesc} />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.appearance}</CardTitle>
            <CardDescription>
              {m.themeLight} / {m.themeDark} / {m.themeSystem}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {themes.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={theme === t.id ? 'default' : 'outline'}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.language}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={locale === 'fr' ? 'default' : 'outline'}
              onClick={() => setLocale('fr')}
            >
              Français
            </Button>
            <Button
              type="button"
              size="sm"
              variant={locale === 'en' ? 'default' : 'outline'}
              onClick={() => setLocale('en')}
            >
              English
            </Button>
          </CardContent>
        </Card>

        {isAdmin(me.data) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{m.modulesTitle}</CardTitle>
              <CardDescription>{m.modulesDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.moduleFeedback}</p>
                  <p className="text-xs text-muted-foreground">{m.moduleFeedbackDesc}</p>
                  {feedback && !feedback.configured ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {m.moduleConfigureFirst}{' '}
                      <Link
                        to="/settings/integrations/feedback"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {m.moduleConfigureLink}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={feedback?.enabled ? 'default' : 'outline'}
                  disabled={setModule.isPending || modules.isLoading || !feedback?.configured}
                  onClick={() => {
                    if (!feedback) return
                    void setModule.mutateAsync(
                      { id: 'feedback', enabled: !feedback.enabled },
                      {
                        onSuccess: (_data, vars) => {
                          toast.success(
                            vars.enabled ? m.moduleFeedbackEnabled : m.moduleFeedbackDisabled,
                          )
                        },
                        onError: (err) => {
                          toast.error(m.error, { description: apiErrorToMessage(err, m) })
                        },
                      },
                    )
                  }}
                >
                  {feedback?.enabled ? m.moduleOn : m.moduleOff}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.account}</CardTitle>
            <CardDescription>{m.session}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <Label>{m.me}</Label>
              <span className="font-mono text-xs text-muted-foreground">{me.data?.subject}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <Label>{m.authMethod}</Label>
              <span className="text-muted-foreground">{me.data?.authMethod}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
