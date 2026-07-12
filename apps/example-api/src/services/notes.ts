import { AppError } from '@gosilex/core'
import {
  deleteObject,
  getObject,
  joinObjectKey,
  type KitR2Bucket,
  putObject,
} from '@gosilex/storage'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { schema } from '../db/schema'
import * as notesRepo from '../repos/notes'

type Db = DrizzleD1Database<typeof schema>

export async function listNotes(db: Db, subject: string) {
  return notesRepo.listNotes(db, subject)
}

export async function createNote(
  db: Db,
  bucket: KitR2Bucket,
  subject: string,
  input: { title: string; body?: string; attachmentText?: string },
) {
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const note = await notesRepo.createNote(db, {
    id,
    subject,
    title: input.title,
    body: input.body ?? '',
    createdAt,
  })
  if (input.attachmentText) {
    const key = joinObjectKey('demo', id, 'attachment.txt')
    await putObject(bucket, key, input.attachmentText, {
      httpMetadata: { contentType: 'text/plain' },
    })
  }
  return note
}

export async function getNoteWithAttachment(
  db: Db,
  bucket: KitR2Bucket,
  id: string,
  subject: string,
) {
  const note = await notesRepo.getNote(db, id, subject)
  if (!note) throw AppError.notFound('Note not found')
  const key = joinObjectKey('demo', id, 'attachment.txt')
  const obj = await getObject(bucket, key)
  const attachment = obj ? await obj.text() : null
  return { ...note, attachment }
}

export async function removeNote(db: Db, bucket: KitR2Bucket, id: string, subject: string) {
  const note = await notesRepo.getNote(db, id, subject)
  if (!note) throw AppError.notFound('Note not found')
  try {
    await deleteObject(bucket, joinObjectKey('demo', id, 'attachment.txt'))
  } catch {
    // ignore missing object
  }
  await notesRepo.deleteNote(db, id, subject)
}
