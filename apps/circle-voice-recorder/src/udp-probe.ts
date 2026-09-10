import { createSocket } from 'node:dgram'

export type UdpProbeResult = {
  ok: boolean
  host: string
  port: number
  elapsedMs: number
  bytesReceived: number
  error?: string
}

/**
 * Generic UDP egress check. A reply from 1.1.1.1:53 proves the VM can do UDP,
 * not that Discord RTP works. Always follow with a real voice session.
 */
export function probeUdp(input?: {
  host?: string
  port?: number
  timeoutMs?: number
  payload?: Uint8Array
}): Promise<UdpProbeResult> {
  const host = input?.host ?? process.env.UDP_PROBE_HOST ?? '1.1.1.1'
  const port = input?.port ?? Number(process.env.UDP_PROBE_PORT ?? 53)
  const timeoutMs = input?.timeoutMs ?? 2_000
  // Minimal DNS QUERY for "." — any UDP echo/reply counts as success.
  const payload =
    input?.payload ??
    Uint8Array.from([
      0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
      0x00, 0x01,
    ])
  const started = Date.now()

  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    const finish = (result: Omit<UdpProbeResult, 'host' | 'port' | 'elapsedMs'>) => {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      resolve({ ...result, host, port, elapsedMs: Date.now() - started })
    }
    const timer = setTimeout(
      () => finish({ ok: false, bytesReceived: 0, error: 'timeout' }),
      timeoutMs,
    )
    socket.on('error', (err) => {
      clearTimeout(timer)
      finish({ ok: false, bytesReceived: 0, error: err.message })
    })
    socket.on('message', (msg) => {
      clearTimeout(timer)
      finish({ ok: true, bytesReceived: msg.length })
    })
    socket.send(payload, port, host, (err) => {
      if (err) {
        clearTimeout(timer)
        finish({ ok: false, bytesReceived: 0, error: err.message })
      }
    })
  })
}
