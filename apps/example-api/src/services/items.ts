import { AppError } from '@gosilex/core'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as itemsRepo from '../repos/items'

type Db = DrizzleD1Database<typeof schema>

export async function listItems(db: Db, subject: string, q?: string) {
  return itemsRepo.listItems(db, subject, q)
}

export async function getItem(db: Db, id: string, subject: string) {
  const item = await itemsRepo.getItem(db, id, subject)
  if (!item) throw AppError.notFound('Item not found')
  return item
}

export async function createItem(
  db: Db,
  subject: string,
  input: { code: string; label: string; description?: string; active?: boolean },
) {
  const code = input.code.trim()
  const label = input.label.trim()
  if (!code || !label) {
    throw AppError.validation('code and label are required')
  }
  const existing = await itemsRepo.getItemByCode(db, subject, code)
  if (existing) {
    throw AppError.conflict('Item code already exists', { code })
  }
  const now = Date.now()
  return itemsRepo.createItem(db, {
    id: crypto.randomUUID(),
    subject,
    code,
    label,
    description: input.description?.trim() ?? '',
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  })
}

export async function updateItem(
  db: Db,
  id: string,
  subject: string,
  input: { label?: string; description?: string; active?: boolean },
) {
  const current = await itemsRepo.getItem(db, id, subject)
  if (!current) throw AppError.notFound('Item not found')
  const patch: Parameters<typeof itemsRepo.updateItem>[3] = { updatedAt: Date.now() }
  if (input.label !== undefined) patch.label = input.label.trim()
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.active !== undefined) patch.active = input.active
  const updated = await itemsRepo.updateItem(db, id, subject, patch)
  if (!updated) throw AppError.notFound('Item not found')
  return updated
}

export async function removeItem(db: Db, id: string, subject: string) {
  const current = await itemsRepo.getItem(db, id, subject)
  if (!current) throw AppError.notFound('Item not found')
  await itemsRepo.deleteItem(db, id, subject)
}
