import type { ListQuery } from '@kit/types'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { DeliveryRef } from '../delivery-ref'
import type { DeliveryState, DestinationFacts, Json, Rule, Selector, SourceRef } from '../types'

export type Db = DrizzleD1Database<Record<string, unknown>>
export type RuleScope =
  | Readonly<{ level: 'deployment' }>
  | Readonly<{ level: 'organization'; orgId: string }>
  | Readonly<{ level: 'user'; userId: string }>

export type DestinationRow = Readonly<{
  id: string
  orgId: string
  channel: string
  externalId: string
  selector: Selector
  createdAt: number
  updatedAt: number
}>
export type ConfiguredDestination = DestinationRow & Readonly<{ facts: DestinationFacts }>
export type AdmissionBatch = Readonly<{
  orgId: string
  type: string
  moduleId: string | null
  source: SourceRef
  params: Json
  now: number
  users: readonly Readonly<{
    id: string
    userId: string
    deliveries: readonly Readonly<{ id: string; channel: string }>[]
  }>[]
  organizations: readonly Readonly<{ id: string; destinationId: string; channel: string }>[]
}>
export type AdmissionOwnerIdentity = Readonly<{
  ref: DeliveryRef
  workflowId: string
  admissionDeadlineAt: number
}>
export type NotifyResult = Readonly<{
  createdNotificationIds: readonly string[]
  createdDeliveries: readonly DeliveryRef[]
}>
export type ResolveInput = Readonly<{
  orgId: string
  source: SourceRef
  types?: readonly string[]
  userIds?: readonly string[]
}>
export type ResolveResult = Readonly<{
  resolvedNotifications: number
  skippedDeliveries: number
  resolvedOrganizationDeliveries: number
}>
export type InboxScope = Readonly<{
  orgId: string
  userId: string
  readableModuleIds: readonly string[]
}>
export type NotificationRow = Readonly<{
  id: string
  orgId: string
  userId: string
  type: string
  moduleId: string | null
  source: SourceRef
  params: Json
  createdAt: number
  readAt: number | null
  resolvedAt: number | null
}>
export type DeliveryRow = Readonly<{
  ref: DeliveryRef
  channel: string
  type: string
  moduleId: string | null
  source: SourceRef
  params: Json
  userId: string | null
  destinationId: string | null
  resolvedAt: number | null
  status: DeliveryState
  workflowId: string
  admissionStatus: 'pending' | 'admitted' | 'unknown' | 'expired'
  admissionDeadlineAt: number
  admittedAt: number | null
  lastAdmissionCheckAt: number | null
  attemptCount: number
  lastAttemptAt: number | null
  errorCode: string | null
  createdAt: number
  finishedAt: number | null
}>
export type RuleRow = Rule & Readonly<{ id: string; createdAt: number; updatedAt: number }>
export type AuditRow = Readonly<{
  id: string
  actorUserId: string
  orgId: string | null
  targetId: string
  action: string
  meta: Readonly<Record<string, Json>>
  createdAt: number
}>
export type DeliveryMetadata = Readonly<{
  id: string
  targetKind: 'user' | 'organization'
  userId: string | null
  destinationId: string | null
  type: string
  channel: string
  status: DeliveryState
  errorCode: string | null
  attemptCount: number
  admissionStatus: 'pending' | 'admitted' | 'unknown' | 'expired'
  createdAt: number
  finishedAt: number | null
}>
export type DeliveryQuery = ListQuery &
  Readonly<{
    status?: DeliveryState
    channel?: string
    type?: string
    targetKind?: 'user' | 'organization'
  }>
