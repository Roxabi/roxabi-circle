import { Button } from '@kit/ui'
import { Link } from '@tanstack/react-router'
import { useLocale } from '../lib/locale'

/** TanStack Router defaultErrorComponent — ShipFast-style error + support CTA. */
export function RouteErrorComponent({ error }: { error: Error }) {
  const { m } = useLocale()
  const support = `mailto:support@example.com?subject=${encodeURIComponent(m.errPageTitle)}`

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{m.errPageTitle}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{m.loadFailed}</p>
      {import.meta.env.DEV && error?.message ? (
        <pre className="max-w-lg overflow-auto rounded-md border bg-muted p-3 text-left text-xs">
          {error.message}
        </pre>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="outline" render={<Link to="/" />}>
          {m.navDashboard}
        </Button>
        <Button type="button" render={<a href={support} />}>
          {m.errSupportCta}
        </Button>
      </div>
    </div>
  )
}
