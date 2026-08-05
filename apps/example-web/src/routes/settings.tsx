import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Separator,
} from '@kit/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AccountPasswordForm } from '../components/account-password-form'
import { AccountProfileForm } from '../components/account-profile-form'
import { PageHeader } from '../components/app-shell'
import { signOutAndClearSession, useMe } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { type Theme, useTheme } from '../lib/theme'

export function SettingsPage() {
  const { m, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const themes: { id: Theme; label: string }[] = [
    { id: 'light', label: m.themeLight },
    { id: 'dark', label: m.themeDark },
    { id: 'system', label: m.themeSystem },
  ]

  const logout = async () => {
    try {
      await signOutAndClearSession(qc)
      toast.message(m.logout)
      await navigate({ to: '/login' })
    } catch {
      toast.error(m.error, { description: m.errUnauthorized })
    }
  }

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

        <Card id="profile">
          <CardHeader>
            <CardTitle className="text-base">{m.account}</CardTitle>
            <CardDescription>{m.session}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <Label>{m.email}</Label>
              <span className="text-xs text-muted-foreground">{me.data?.email ?? '—'}</span>
            </div>
            <Separator />
            <AccountProfileForm />
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <Label>{m.me}</Label>
              <span className="font-mono text-xs text-muted-foreground">{me.data?.subject}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <Label>{m.authMethod}</Label>
              <span className="text-muted-foreground">{me.data?.authMethod}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <Label>platformRole</Label>
              <span className="text-muted-foreground">{me.data?.platformRole ?? 'null'}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <Label>{m.navOrgs}</Label>
              <span className="text-muted-foreground">
                {me.data?.orgs?.map((o) => o.slug).join(', ') || '—'}
              </span>
            </div>
            <Separator />
            <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
              {m.logout}
            </Button>
          </CardContent>
        </Card>

        <Card id="password">
          <CardHeader>
            <CardTitle className="text-base">{m.changePasswordTitle}</CardTitle>
            <CardDescription>{m.changePasswordDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountPasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
