import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@kit/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronsUpDown, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorToMessage, apiFetch } from '../lib/api'
import { type MeResponse, meQueryKey } from '../lib/auth'
import { useLocale } from '../lib/locale'
import { useOrgContext } from '../lib/org-context'
import { orgRoleLabel } from '../lib/org-role'
import { createOrgSchema } from '../lib/schemas'

/**
 * Sidebar org switcher — same structure as sidebar-07 `TeamSwitcher`
 * (`SidebarHeader` → `SidebarMenu` → dropdown + « Add team » create footer).
 */
export function OrgSwitcher() {
  const { m } = useLocale()
  const { isMobile } = useSidebar()
  const { orgs, activeOrg, setActiveOrgId } = useOrgContext()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  // Visual ⌘1…9 chrome only (sidebar-07 TeamSwitcher) — do not bind Mod+digit
  // (browser tab shortcuts / focus traps).

  const createOrg = useMutation({
    mutationFn: (input: { name: string; slug?: string }) =>
      apiFetch<{ org: { id: string; name: string; slug: string } }>('/api/orgs', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (data) => {
      // Optimistic membership so OrgProvider does not snap back to orgs[0]
      // while /api/me is still refetching.
      qc.setQueryData<MeResponse>(meQueryKey, (prev) => {
        if (!prev) return prev
        if (prev.orgs.some((o) => o.id === data.org.id)) return prev
        const membership: MeResponse['orgs'][number] = {
          id: data.org.id,
          name: data.org.name,
          slug: data.org.slug,
          kind: 'client',
          status: 'active',
          role: 'owner',
        }
        return { ...prev, orgs: [membership, ...prev.orgs] }
      })
      setActiveOrgId(data.org.id)
      await qc.invalidateQueries({ queryKey: meQueryKey })
      toast.success(m.orgCreated, { description: data.org.name })
      setCreateOpen(false)
      setName('')
      setSlug('')
      setNameError(null)
    },
    onError: (err) => {
      toast.error(m.error, { description: apiErrorToMessage(err, m) })
    },
  })

  const openCreate = () => {
    setName('')
    setSlug('')
    setNameError(null)
    // Defer past DropdownMenu close/focus restore so Dialog trap mounts cleanly.
    queueMicrotask(() => setCreateOpen(true))
  }

  const submitCreate = (e: FormEvent) => {
    e.preventDefault()
    const parsed = createOrgSchema.safeParse({ name, slug })
    if (!parsed.success) {
      setNameError(m.orgNameRequired)
      return
    }
    setNameError(null)
    const slugTrim = parsed.data.slug?.trim() ?? ''
    createOrg.mutate(
      slugTrim.length > 0 ? { name: parsed.data.name, slug: slugTrim } : { name: parsed.data.name },
    )
  }

  const current = activeOrg ?? orgs[0]
  const initials = current
    ? current.name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : ''

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                  aria-label={m.orgPicker}
                />
              }
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {current ? (
                  <span className="text-xs font-bold">{initials || 'OR'}</span>
                ) : (
                  <Building2 className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {current ? current.name : m.orgPickerEmpty}
                </span>
                {current ? (
                  <span className="truncate text-xs">
                    {orgRoleLabel(current.role, m)}
                    {current.slug ? ` · ${current.slug}` : ''}
                  </span>
                ) : (
                  <span className="truncate text-xs text-muted-foreground">{m.orgCreate}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-fit min-w-56"
              align="start"
              side={isMobile ? 'bottom' : 'right'}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {m.orgPicker}
                </DropdownMenuLabel>
                {orgs.length === 0 ? (
                  <DropdownMenuItem disabled className="gap-2 p-2 text-muted-foreground">
                    {m.orgPickerEmpty}
                  </DropdownMenuItem>
                ) : (
                  orgs.map((org, index) => {
                    const tile = org.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    return (
                      <DropdownMenuItem
                        key={org.id}
                        className="gap-2 p-2"
                        onClick={() => setActiveOrgId(org.id)}
                      >
                        <div className="flex size-6 items-center justify-center rounded-md border text-[10px] font-semibold">
                          {tile || '·'}
                        </div>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-medium">{org.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {orgRoleLabel(org.role, m)}
                          </span>
                        </div>
                        {index < 9 ? (
                          <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                        ) : null}
                      </DropdownMenuItem>
                    )
                  })
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="gap-2 p-2" onClick={openCreate}>
                  <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                    <Plus className="size-4" />
                  </div>
                  <div className="font-medium text-muted-foreground">{m.orgCreate}</div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.orgCreateTitle}</DialogTitle>
            <DialogDescription>{m.orgCreateDesc}</DialogDescription>
          </DialogHeader>
          <form id="create-org" className="flex flex-col gap-4" onSubmit={submitCreate}>
            <Field>
              <FieldLabel htmlFor="org-name">{m.orgName}</FieldLabel>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                autoFocus
                aria-invalid={Boolean(nameError) || undefined}
                aria-describedby={nameError ? 'org-name-error' : undefined}
              />
              {nameError ? <FieldError id="org-name-error">{nameError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">{m.orgSlug}</FieldLabel>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={m.orgSlugHint}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {m.cancel}
            </Button>
            <Button type="submit" form="create-org" disabled={createOrg.isPending}>
              {m.orgCreate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
