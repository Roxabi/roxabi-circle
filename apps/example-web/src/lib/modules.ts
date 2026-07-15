import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'

export type ModuleState = {
  enabled: boolean
  configured: boolean
  configPath: string
}

export type ModulesResponse = {
  modules: Record<string, ModuleState>
  requestId: string
}

export const modulesQueryKey = ['modules'] as const

export function useModules(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: modulesQueryKey,
    queryFn: () => apiFetch<ModulesResponse>('/api/modules'),
    staleTime: 30_000,
    enabled: opts?.enabled ?? true,
  })
}

export function useSetModuleEnabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<ModulesResponse>(`/api/modules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(modulesQueryKey, data)
    },
  })
}

export function getModuleState(
  modules: Record<string, ModuleState> | undefined,
  id: string,
): ModuleState | undefined {
  return modules?.[id]
}

export function isModuleOn(modules: Record<string, ModuleState> | undefined, id: string): boolean {
  return Boolean(modules?.[id]?.enabled)
}
