import type { FEEDBACK_PRIORITIES, FEEDBACK_TYPES } from './constants'

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number]

export type FeedbackFormFields = {
  type: FeedbackType
  priority: FeedbackPriority
  title: string
  body: string
  page: string
  agent: string
  files: File[]
}

export type FeedbackSubmitSuccess = {
  ok: true
  ref?: number
  clientSlug?: string
  type?: string
  images?: number
}

export type FeedbackSubmitError = {
  ok: false
  error: string
  status: number
}

export type FeedbackSubmitResult = FeedbackSubmitSuccess | FeedbackSubmitError

export type PilotageRemoteConfig = {
  baseUrl: string
  apiKey: string
  fetch?: typeof fetch
}
