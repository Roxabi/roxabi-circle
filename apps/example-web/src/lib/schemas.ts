import { z } from 'zod'

/** Shared Zod schemas for TanStack Form (stack contract). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

/** Magic-link request — email only (B-magic #59). */
export const magicLinkSchema = z.object({
  email: z.string().email(),
})

/** BA default min password length is typically 8. */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8).max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'mismatch' })

/** Authenticated change-password (B-account #60). Checkbox is outside Zod. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'mismatch' })

/** Profile display name only (email change out of scope). */
export const profileNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000),
})

export type LoginValues = z.infer<typeof loginSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type MagicLinkValues = z.infer<typeof magicLinkSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
export type ProfileNameValues = z.infer<typeof profileNameSchema>
export type CreateNoteValues = z.infer<typeof createNoteSchema>
