/** Demo job bodies — kit only (`demo.*`). Product job names stay out of the kit. */
export type DemoJob =
  | { type: 'demo.ping'; at: number; subject?: string }
  | { type: 'demo.log'; message: string }

export type JobHandleResult = {
  ok: boolean
  action: 'handled' | 'ignored'
  type: string
}

export function parseDemoJob(raw: unknown): DemoJob | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.type === 'demo.ping' && typeof o.at === 'number') {
    return {
      type: 'demo.ping',
      at: o.at,
      subject: typeof o.subject === 'string' ? o.subject : undefined,
    }
  }
  if (o.type === 'demo.log' && typeof o.message === 'string') {
    return { type: 'demo.log', message: o.message }
  }
  return null
}

/**
 * Handle one demo job. Unknown types are ignored (ack path) — never throw.
 */
export function handleDemoJob(raw: unknown): JobHandleResult {
  const job = parseDemoJob(raw)
  if (!job) {
    const type =
      raw && typeof raw === 'object' && 'type' in raw
        ? String((raw as { type: unknown }).type)
        : 'unknown'
    console.log(JSON.stringify({ level: 'info', msg: 'demo_job_unknown', type }))
    return { ok: true, action: 'ignored', type }
  }
  if (job.type === 'demo.ping') {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'demo_job_ping',
        at: job.at,
        subject: job.subject ?? null,
      }),
    )
    return { ok: true, action: 'handled', type: job.type }
  }
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'demo_job_log',
      message: job.message,
    }),
  )
  return { ok: true, action: 'handled', type: job.type }
}

export function handleScheduledTick(info: { cron: string; scheduledTime: number }): void {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'demo_cron_tick',
      cron: info.cron,
      scheduledTime: info.scheduledTime,
    }),
  )
}
