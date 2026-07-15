import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import { modulesQueryKey } from './modules'

export type FeedbackIntegration = {
  id: 'feedback'
  configured: boolean
  sparkUrl: string
  hasApiKey: boolean
  apiKeyPreview: string | null
}

export type IntegrationResponse = {
  integration: FeedbackIntegration
  requestId: string
}

export const integrationQueryKey = (id: string) => ['integration', id] as const

export function useIntegration(id: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: integrationQueryKey(id),
    queryFn: () => apiFetch<IntegrationResponse>(`/api/integrations/${id}`),
    enabled: opts?.enabled ?? true,
  })
}

export function useSaveIntegration(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { sparkUrl: string; sparkApiKey?: string }) =>
      apiFetch<IntegrationResponse>(`/api/integrations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.setQueryData(integrationQueryKey(id), data)
      void qc.invalidateQueries({ queryKey: modulesQueryKey })
    },
  })
}
