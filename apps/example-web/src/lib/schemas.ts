import { z } from 'zod'

/** Shared Zod schemas for TanStack Form (stack contract). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
})

export type LoginValues = z.infer<typeof loginSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type CreateNoteValues = z.infer<typeof createNoteSchema>
