/** Demo job bodies — kit only (`demo.*`). Product job names stay out of the kit. */
export type DemoJob =
  | { type: 'demo.ping'; at: number; subject?: string }
  | { type: 'demo.log'; message: string }

export type JobHandleResult = {
  ok: boolean
  action: 'handled' | 'ignored'
  type: string
  disposition: 'ack' | 'retry'
}

export type QueueMessage = { body: unknown; ack: () => void; retry: () => void }

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
 * Handle one demo job. Unknown / unparsable bodies are poison-dropped (`ack`) — never throw.
 */
export async function handleDemoJob(raw: unknown): Promise<JobHandleResult> {
  const job = parseDemoJob(raw)
  if (!job) {
    const type = raw && typeof raw === 'object' && 'type' in raw ? String(raw.type) : 'unknown'
    console.log(JSON.stringify({ level: 'info', msg: 'demo_job_unknown', type }))
    return { ok: true, action: 'ignored', type, disposition: 'ack' }
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
    return { ok: true, action: 'handled', type: job.type, disposition: 'ack' }
  }
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'demo_job_log',
      message: job.message,
    }),
  )
  return { ok: true, action: 'handled', type: job.type, disposition: 'ack' }
}

/**
 * Honors `JobHandleResult.disposition`. Unexpected throw retries.
 * `retry` means this attempt could not go on: a handler never returns it, nor
 * throws, to leave work it could do for a later attempt (ADR-0018 D2, continuation).
 * Product copies must set consumer `max_retries` + a dead-letter queue —
 * this demo consumer does not (live demo jobs always ack).
 */
export async function consumeQueueMessage(
  msg: QueueMessage,
  handle: (body: unknown) => Promise<JobHandleResult> = handleDemoJob,
): Promise<void> {
  try {
    const result = await handle(msg.body)
    if (result.disposition === 'retry') {
      msg.retry()
      return
    }
    msg.ack()
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'demo_queue_handler_error',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    msg.retry()
  }
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
