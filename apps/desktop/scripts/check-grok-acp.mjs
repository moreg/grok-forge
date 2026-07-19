import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const installed = join(process.env.USERPROFILE ?? '', '.grok', 'bin', 'grok.exe')
const binary = existsSync(installed) ? installed : 'grok'
const workspace = fileURLToPath(new URL('../../..', import.meta.url))
const child = spawn(binary, ['agent', 'stdio'], {
  cwd: workspace,
  stdio: ['pipe', 'pipe', 'pipe'],
})
const lines = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1
let stderr = ''

child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message ?? 'ACP error'))
    else resolve(message.result ?? {})
  }
})

function request(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

const timeout = setTimeout(() => {
  console.error(stderr || 'ACP handshake timed out')
  child.kill()
  process.exitCode = 1
}, 30_000)

try {
  await request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
      _meta: {
        'x.ai/incrementalBashOutput': true,
        'x.ai/bashOutputNoColor': true,
        'x.ai/gitHeadChanged': true,
      },
    },
  })
  const session = await request('session/new', {
    cwd: workspace,
    mcpServers: [],
  })
  if (!session.sessionId) throw new Error('Grok did not return a sessionId')
  const sessionId = session.sessionId
  const supports = async (method, params) => {
    try {
      const result = await request(method, params)
      if (!result || typeof result !== 'object') throw new Error('invalid response')
      return true
    } catch (error) {
      if (error instanceof Error && error.message === 'Method not found') return false
      throw error
    }
  }
  const [gitSupported, terminalSupported] = await Promise.all([
    supports('x.ai/git/status', { sessionId, includeUntracked: true, includeStats: true }),
    supports('x.ai/terminal/list', { sessionId }),
  ])
  if (gitSupported && terminalSupported) {
    console.log(`ACP extensions passed: ${sessionId}`)
  } else {
    const missing = [!gitSupported && 'x.ai/git/*', !terminalSupported && 'x.ai/terminal/*'].filter(Boolean).join(', ')
    console.warn(`ACP handshake passed, but this Grok Build lacks: ${missing}`)
    if (process.env.STRICT_GROK_EXTENSIONS === '1') process.exitCode = 1
  }
} finally {
  clearTimeout(timeout)
  child.kill()
}
