import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@kit/ui'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../../components/app-shell'
import { apiErrorToMessage, apiFetch } from '../../lib/api'
import { useLocale } from '../../lib/locale'
import { ImpersonationPermissionsCard } from './impersonation-permissions-card'
import { ImpersonationStart } from './impersonation-start'
import { AdminUsersCreateCard } from './users-create-card'

type AdminUser = {
  id: string
  email: string
  name: string
  platformRole: string | null
  createdAt: string
}

const ADMIN_USERS_PAGE_SIZE = 50

export function AdminUsersPage() {
  const { m } = useLocale()
  const [q, setQ] = useState('')
  const normalizedQ = q.trim()

  const users = useInfiniteQuery({
    queryKey: ['admin-users', normalizedQ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(ADMIN_USERS_PAGE_SIZE) })
      if (pageParam) params.set('cursor', pageParam)
      if (normalizedQ) params.set('q', normalizedQ)
      return apiFetch<{
        items: AdminUser[]
        nextCursor: string | null
        requestId: string
      }>(`/api/admin/users?${params.toString()}`)
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
  const userRows = users.data?.pages.flatMap((page) => page.items) ?? []

  const resend = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/resend-welcome`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => toast.success(m.adminUserWelcomeResent),
    onError: (e) => toast.error(m.error, { description: apiErrorToMessage(e, m) }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title={m.navUsers} description={m.adminUsersDesc} />
      <AdminUsersCreateCard />
      <ImpersonationPermissionsCard />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{m.navUsers}</CardTitle>
            <CardDescription>
              {users.isLoading ? m.loading : `${userRows.length} user(s)`}
            </CardDescription>
          </div>
          <Input
            className="max-w-xs"
            placeholder={m.adminUserSearch}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={m.adminUserSearch}
          />
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : users.isError ? (
            <p className="text-sm text-destructive">{apiErrorToMessage(users.error, m)}</p>
          ) : (
            <div className="space-y-3">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {userRows.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.platformRole ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {u.platformRole}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          client
                        </Badge>
                      )}
                      {!u.platformRole ? <ImpersonationStart userId={u.id} /> : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(u.id)}
                      >
                        {m.adminUserResend}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {users.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={users.isFetchingNextPage}
                  onClick={() => users.fetchNextPage()}
                >
                  {users.isFetchingNextPage ? m.adminUserLoadingMore : m.adminUserLoadMore}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
