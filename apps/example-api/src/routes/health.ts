import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'example-api',
    requestId: c.get('requestId'),
  })
})
