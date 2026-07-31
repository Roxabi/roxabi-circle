import { z } from 'zod'

/** Shared Zod schemas for TanStack Form (stack contract). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

/** BA default min password length is typically 8. */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8).max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'mismatch' })

export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
})

export type LoginValues = z.infer<typeof loginSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type CreateNoteValues = z.infer<typeof createNoteSchema>
