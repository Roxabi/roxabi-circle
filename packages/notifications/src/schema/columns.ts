import { integer, text } from 'drizzle-orm/sqlite-core'

export const id = () => text('id').primaryKey()
export const orgId = () => text('org_id').notNull()
export const createdAt = () => integer('created_at').notNull()
export const updatedAt = () => integer('updated_at').notNull()
export const selector = () => ({
  selectorKind: text('selector_kind').notNull(),
  selectorValue: text('selector_value').notNull(),
})
export const receipt = () => ({
  workflowId: text('workflow_id').notNull(),
  admissionStatus: text('admission_status').notNull(),
  admissionDeadlineAt: integer('admission_deadline_at').notNull(),
  admittedAt: integer('admitted_at'),
  lastAdmissionCheckAt: integer('last_admission_check_at'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at'),
  errorCode: text('error_code'),
  finishedAt: integer('finished_at'),
})
