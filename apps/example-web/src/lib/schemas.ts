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

/** Task create dialog — aligns with kit task title/description ceilings. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000),
  visibility: z.enum(['internal', 'shared']),
})

/** Org create (org-switcher) — mirrors example-api POST /api/orgs. */
export const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(48).optional(),
})

/** Admin user create — email required; name optional. */
export const createAdminUserSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
})

export type LoginValues = z.infer<typeof loginSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type MagicLinkValues = z.infer<typeof magicLinkSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
export type ProfileNameValues = z.infer<typeof profileNameSchema>
export type CreateNoteValues = z.infer<typeof createNoteSchema>
export type CreateTaskValues = z.infer<typeof createTaskSchema>
export type CreateOrgValues = z.infer<typeof createOrgSchema>
export type CreateAdminUserValues = z.infer<typeof createAdminUserSchema>
