import type { OpenAPIHono } from '@hono/zod-openapi'
import { createDb } from '@kit/db'
import { expect } from 'vitest'
import { createApp } from '../app'
import { schema } from '../db/schema'
import { seedDemoDatabase } from '../seed/seed-db'
import type { AppEnv } from '../types'
import { hashFixtureCredential } from './fixture-credential'
import { createMemoryEnv, type EnvLike } from './memory-env'

export const TEST_ORIGIN = 'http://localhost:5173'

export type ApiApp = OpenAPIHono<AppEnv>
export type ApiEnv = EnvLike & { close(): void }

export function createApiTestContext(envOverrides?: Partial<EnvLike> & { through?: string }) {
  const app = createApp()
  const env = createMemoryEnv(envOverrides)
  const db = createDb(env.DB as unknown as D1Database, schema)
  return { app, env, db }
}

export async function seedDemoEnv(env: ApiEnv, seed: Parameters<typeof seedDemoDatabase>[1]) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, seed, hashFixtureCredential)
  return db
}

export async function createSeededDemoApi(options: {
  env?: Partial<EnvLike> & { through?: string }
  seed: Parameters<typeof seedDemoDatabase>[1]
}) {
  const context = createApiTestContext(options.env)
  await seedDemoDatabase(context.db, options.seed, hashFixtureCredential)
  return context
}

function requestCookie(setCookie: string): string {
  return setCookie.split(';', 1)[0]!
}

export async function signIn(
  app: ApiApp,
  env: ApiEnv,
  input: { email: string; password: string; origin?: string },
) {
  const origin = input.origin ?? TEST_ORIGIN
  const response = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: input.email, password: input.password }),
    },
    env,
  )
  expect(response.status, `sign-in ${input.email} → ${response.status}`).toBeLessThan(400)
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie, `cookie for ${input.email}`).toBeTruthy()
  return { response, setCookie: setCookie!, cookie: requestCookie(setCookie!) }
}

export async function loginCookie(
  app: ApiApp,
  env: ApiEnv,
  email: string,
  password: string,
  origin = TEST_ORIGIN,
) {
  return (await signIn(app, env, { email, password, origin })).cookie
}

export function sessionHeaders(
  cookie: string,
  orgId?: string,
  origin = TEST_ORIGIN,
): Record<string, string> {
  return {
    cookie,
    'content-type': 'application/json',
    Origin: origin,
    ...(orgId === undefined ? {} : { 'X-Org-Id': orgId }),
  }
}

export function bearerHeaders(
  key: string,
  orgId?: string,
  origin = TEST_ORIGIN,
): Record<string, string> {
  return {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    Origin: origin,
    ...(orgId === undefined ? {} : { 'X-Org-Id': orgId }),
  }
}
