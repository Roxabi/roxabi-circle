import { QueryClient } from '@tanstack/react-query'

const queryClients = new Set<QueryClient>()

export function createTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClients.add(queryClient)
  return queryClient
}

export function clearTestQueryClients(): void {
  for (const queryClient of queryClients) queryClient.clear()
  queryClients.clear()
}
