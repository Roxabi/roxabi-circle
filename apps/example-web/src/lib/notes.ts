import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'

export type Note = { id: string; title: string; body: string; createdAt: number }

export type NotesResponse = { notes: Note[] }

export type NotesQuery = UseQueryResult<NotesResponse>

const notesQueryKey = ['notes'] as const

export function useNotes() {
  return useQuery({
    queryKey: notesQueryKey,
    queryFn: () => apiFetch<NotesResponse>('/api/notes'),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: notesQueryKey })
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: notesQueryKey })
    },
  })
}
