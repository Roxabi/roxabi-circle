import {
  FEEDBACK_DEFAULT_PRIORITY,
  FEEDBACK_DEFAULT_TYPE,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_TYPES,
} from './constants'
import type { FeedbackFormFields, FeedbackPriority, FeedbackType } from './types'

function isUploadFile(v: unknown): v is File {
  return (
    typeof v === 'object' &&
    v !== null &&
    'size' in v &&
    'type' in v &&
    typeof (v as File).size === 'number' &&
    (v as File).size > 0
  )
}

export function isFeedbackType(v: string): v is FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(v)
}

export function isFeedbackPriority(v: string): v is FeedbackPriority {
  return (FEEDBACK_PRIORITIES as readonly string[]).includes(v)
}

/**
 * Parse un FormData « Signaler » (client → proxy host).
 * N'exige pas l'auth — à faire côté handler.
 */
export function parseFeedbackFormData(form: FormData): FeedbackFormFields | { error: string } {
  const title = String(form.get('title') || '').trim()
  if (!title) return { error: 'Titre requis.' }

  const typeRaw = String(form.get('type') || FEEDBACK_DEFAULT_TYPE)
  const type = isFeedbackType(typeRaw) ? typeRaw : FEEDBACK_DEFAULT_TYPE

  const prioRaw = String(form.get('priority') || FEEDBACK_DEFAULT_PRIORITY)
  const priority = isFeedbackPriority(prioRaw) ? prioRaw : FEEDBACK_DEFAULT_PRIORITY

  const body = String(form.get('body') || form.get('description') || '').trim()
  const page = String(form.get('page') || '').trim()
  const agent = String(form.get('agent') || '').trim()

  const files: File[] = []
  for (const entry of form.getAll('file')) {
    if (!isUploadFile(entry)) continue
    if (!entry.type.startsWith('image/') || entry.size > FEEDBACK_MAX_IMAGE_BYTES) continue
    files.push(entry)
    if (files.length >= FEEDBACK_MAX_IMAGES) break
  }

  return {
    type,
    priority,
    title: title.slice(0, 200),
    body: body.slice(0, 8000),
    page,
    agent,
    files,
  }
}

/** Construit le FormData pour POST /api/report (UI → host). */
export function buildClientFormData(fields: {
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  body: string
  page?: string
  agent?: string
  files?: File[]
}): FormData {
  const fd = new FormData()
  fd.append('type', fields.type)
  fd.append('priority', fields.priority)
  fd.append('title', fields.title)
  fd.append('body', fields.body)
  if (fields.page) fd.append('page', fields.page)
  if (fields.agent) fd.append('agent', fields.agent)
  for (const f of fields.files ?? []) {
    fd.append('file', f, f.name)
  }
  return fd
}
