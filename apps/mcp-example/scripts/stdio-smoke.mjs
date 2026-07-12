#!/usr/bin/env bun
/**
 * Real stdio smoke against mcp-example entry: list tools + call ping + whoami.
 * Writes JSON-RPC transcript lines to stdout for capture.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const entry = join(root, '../src/index.ts')

const child = spawn('bun', ['run', entry], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    API_KEY: process.env.API_KEY || 'sk_stdio_smoke_test_key_abcdef',
  },
})

let buf = ''
const lines = []
const transcript = []

function send(msg) {
  const line = `${JSON.stringify(msg)}\n`
  transcript.push({ dir: 'out', msg })
  child.stdin.write(line)
}

function onLine(line) {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    transcript.push({ dir: 'in-raw', line })
    return
  }
  transcript.push({ dir: 'in', msg })
  lines.push(msg)
}

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  for (;;) {
    const idx = buf.indexOf('\n')
    if (idx < 0) break
    const line = buf.slice(0, idx)
    buf = buf.slice(idx + 1)
    onLine(line)
  }
})

child.stderr.on('data', (chunk) => {
  transcript.push({ dir: 'stderr', text: chunk.toString('utf8') })
})

function waitFor(pred, timeoutMs = 5000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const hit = lines.find(pred)
      if (hit) return resolve(hit)
      if (Date.now() - start > timeoutMs) {
        return reject(
          new Error(
            `timeout waiting for MCP response: ${JSON.stringify(transcript).slice(0, 2000)}`,
          ),
        )
      }
      setTimeout(tick, 25)
    }
    tick()
  })
}

async function main() {
  // initialize
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'stdio-smoke', version: '0.0.1' },
    },
  })
  await waitFor((m) => m.id === 1)

  send({ jsonrpc: '2.0', method: 'notifications/initialized' })

  // list tools
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const listed = await waitFor((m) => m.id === 2)
  const tools = listed.result?.tools?.map((t) => t.name) ?? []
  if (!tools.includes('ping') || !tools.includes('whoami')) {
    throw new Error(`expected ping+whoami, got ${JSON.stringify(tools)}`)
  }
  if (tools.some((n) => String(n).startsWith('share_'))) {
    throw new Error(`share_* tools forbidden: ${JSON.stringify(tools)}`)
  }

  // ping
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'ping', arguments: {} },
  })
  const ping = await waitFor((m) => m.id === 3)
  if (ping.error) throw new Error(`ping failed: ${JSON.stringify(ping.error)}`)

  // whoami
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'whoami', arguments: {} },
  })
  const who = await waitFor((m) => m.id === 4)
  if (who.error) throw new Error(`whoami failed: ${JSON.stringify(who.error)}`)

  console.log(
    JSON.stringify(
      {
        ok: true,
        tools,
        ping: ping.result,
        whoami: who.result,
        transcript,
      },
      null,
      2,
    ),
  )

  child.kill('SIGTERM')
  process.exit(0)
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err), transcript }, null, 2))
  child.kill('SIGTERM')
  process.exit(1)
})
