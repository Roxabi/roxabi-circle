/**
 * Spike A recorder process — Cloudflare Container (or Fly) entry.
 * HTTP control plane only. Does not open Discord Gateway.
 */
import { handleRecorderRequest } from './http'

const port = Number(process.env.PORT ?? 8080)

const server = Bun.serve({
  port,
  fetch: (request) => handleRecorderRequest(request, process.env),
})

console.log(`circle-voice-recorder spike-a listening :${server.port}`)

function shutdown() {
  server.stop()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
