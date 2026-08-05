import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui'
import { PageHeader } from '../components/app-shell'
import { useLocale } from '../lib/locale'
import { getReleases, pickBullets, pickLocalized } from '../lib/releases'

export function ChangelogPage() {
  const { m, locale } = useLocale()
  const items = getReleases()

  return (
    <div>
      <PageHeader title={m.changelogTitle} description={m.changelogDesc} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.changelogEmpty}</p>
      ) : (
        <div className="mx-auto grid max-w-2xl gap-4">
          {items.map((release) => {
            const title = pickLocalized(release.title, locale)
            const bullets = pickBullets(release, locale)
            return (
              <Card key={release.id}>
                <CardHeader className="gap-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      v{release.version}
                    </span>
                    <time className="text-xs text-muted-foreground" dateTime={release.date}>
                      {formatReleaseDate(release.date, locale)}
                    </time>
                  </div>
                  <CardTitle className="text-base">{title || release.id}</CardTitle>
                  {bullets.length === 0 ? (
                    <CardDescription>{m.changelogEmpty}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {bullets.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {bullets.map((line) => (
                        <li key={`${release.id}:${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {release.gifSrc ? (
                    <img
                      src={release.gifSrc}
                      alt=""
                      className="max-h-64 w-full rounded-md border object-contain"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.hidden = true
                      }}
                    />
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatReleaseDate(isoDate: string, locale: string): string {
  const t = Date.parse(isoDate)
  if (!Number.isFinite(t)) return isoDate
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(t))
  } catch {
    return isoDate
  }
}
