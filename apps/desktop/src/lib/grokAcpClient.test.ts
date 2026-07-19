import { describe, expect, it, vi } from 'vitest'
import { GrokAcpClient, NativeGrokTransport, type GrokTransport } from './grokAcpClient'

class FakeTransport implements GrokTransport {
  sent: Array<Record<string, unknown>> = []
  startedWith = ''
  stopped = false
  listener: (payload: unknown) => void = () => undefined

  async start(cwd: string) {
    this.startedWith = cwd
  }

  async send(payload: unknown) {
    const message = payload as Record<string, unknown>
    this.sent.push(message)
    const method = message.method
    const result = method === 'session/new' ? { sessionId: 'session-42' } : { protocolVersion: 1 }
    queueMicrotask(() => this.listener({ jsonrpc: '2.0', id: message.id, result }))
  }

  async listen(listener: (payload: unknown) => void) {
    this.listener = listener
    return () => undefined
  }

  async stop() {
    this.stopped = true
  }
}

describe('GrokAcpClient', () => {
  it('initializes ACP and creates a workspace session', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)

    await expect(client.connect('E:\\repo')).resolves.toEqual({ sessionId: 'session-42', restored: false })

    expect(transport.startedWith).toBe('E:\\repo')
    expect(transport.sent.map((message) => message.method)).toEqual(['initialize', 'session/new'])
    expect(transport.sent[1].params).toEqual({ cwd: 'E:\\repo', mcpServers: [] })
  })

  it('injects preferred model into session/new and session/setModel', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    client.setPreferredModel('grok-4.5')

    await client.connect('E:\\repo')
    expect(transport.sent.find((message) => message.method === 'session/new')?.params).toEqual({
      cwd: 'E:\\repo',
      mcpServers: [],
      _meta: { modelId: 'grok-4.5' },
    })

    await expect(client.setSessionModel('grok-build')).resolves.toMatchObject({
      applied: true,
      mode: 'session',
    })
    const setModel = transport.sent.find((message) => message.method === 'session/setModel')
    expect(setModel?.params).toEqual({ sessionId: 'session-42', modelId: 'grok-build' })
    expect(client.preferredModel).toBe('grok-build')
    expect(client.capabilities.setModel).toBe(true)
  })

  it('soft-fails setModel when the runtime lacks the method', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      if (method === 'session/setModel') {
        queueMicrotask(() => transport.listener({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: 'Method not found' },
        }))
        return
      }
      const result = method === 'session/new' ? { sessionId: 'session-42' } : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ jsonrpc: '2.0', id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')
    await expect(client.setSessionModel('grok-4')).resolves.toMatchObject({
      applied: false,
      mode: 'pending',
    })
    expect(client.preferredModel).toBe('grok-4')
    expect(client.capabilities.setModel).toBe(false)
    await expect(client.setSessionModel('grok-3-fast')).resolves.toMatchObject({
      applied: false,
      mode: 'pending',
    })
    expect(transport.sent.filter((message) => message.method === 'session/setModel')).toHaveLength(1)
  })

  it('restores a previous session when the agent supports loadSession', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      const result = method === 'initialize'
        ? { protocolVersion: 1, agentCapabilities: { loadSession: true } }
        : method === 'session/load'
          ? null
          : method === 'session/new'
            ? { sessionId: 'session-new' }
            : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ jsonrpc: '2.0', id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await expect(client.connect('E:\\repo', 'task-1', [], 'sess_old')).resolves.toEqual({
      sessionId: 'sess_old',
      restored: true,
    })
    expect(client.canLoadSession).toBe(true)
    expect(transport.sent.map((message) => message.method)).toEqual(['initialize', 'session/load'])
  })

  it('lists local terminals via the desktop bridge', async () => {
    const bridge = await import('./desktopBridge')
    const listSpy = vi.spyOn(bridge, 'terminalList').mockResolvedValue([
      { terminalId: 't1', name: 'cmd', status: 'running', output: '', truncated: false },
    ])
    const client = new GrokAcpClient(new FakeTransport())
    await expect(client.listLocalTerminals()).resolves.toHaveLength(1)
    listSpy.mockRejectedValueOnce(new Error('offline'))
    await expect(client.listLocalTerminals()).resolves.toEqual([])
    listSpy.mockRestore()
  })

  it('falls back to session/new when session/load fails', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      if (method === 'session/load') {
        queueMicrotask(() => transport.listener({ jsonrpc: '2.0', id: message.id, error: { message: 'missing' } }))
        return
      }
      const result = method === 'initialize'
        ? { protocolVersion: 1, agentCapabilities: { loadSession: true } }
        : method === 'session/new'
          ? { sessionId: 'session-fresh' }
          : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ jsonrpc: '2.0', id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await expect(client.connect('E:\\repo', 'task-2', [], 'sess_missing')).resolves.toEqual({
      sessionId: 'session-fresh',
      restored: false,
    })
  })

  it('submits prompts against the active session', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')

    await client.prompt('检查测试')

    expect(transport.sent.at(-1)).toMatchObject({
      method: 'session/prompt',
      params: {
        sessionId: 'session-42',
        prompt: [{ type: 'text', text: '检查测试' }],
      },
    })
  })

  it('answers fs read and write requests from the agent', async () => {
    const bridge = await import('./desktopBridge')
    const readSpy = vi.spyOn(bridge, 'readTextFile').mockResolvedValue('hello')
    const writeSpy = vi.spyOn(bridge, 'writeTextFile').mockResolvedValue(undefined)
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')
    const events: unknown[] = []
    client.onEvent((event) => events.push(event))

    transport.listener({
      jsonrpc: '2.0',
      id: 50,
      method: 'fs/read_text_file',
      params: { path: 'src/a.ts', line: 1, limit: 10 },
    })
    await vi.waitFor(() => expect(transport.sent.some((item) => item.id === 50 && item.result)).toBe(true))
    expect(readSpy).toHaveBeenCalledWith('src/a.ts', { line: 1, limit: 10 })

    transport.listener({
      jsonrpc: '2.0',
      id: 51,
      method: 'fs/write_text_file',
      params: { path: 'src/a.ts', content: 'new' },
    })
    await vi.waitFor(() => expect(transport.sent.some((item) => item.id === 51 && item.result === null)).toBe(true))
    expect(writeSpy).toHaveBeenCalledWith('src/a.ts', 'new')
    expect(events.some((event) => (event as { kind: string }).kind === 'workspace')).toBe(true)

    readSpy.mockRestore()
    writeSpy.mockRestore()
  })

  it('answers terminal lifecycle requests from the agent', async () => {
    const bridge = await import('./desktopBridge')
    const createSpy = vi.spyOn(bridge, 'terminalCreate').mockResolvedValue('term_9')
    const outputSpy = vi.spyOn(bridge, 'terminalOutput').mockResolvedValue({
      output: 'ok\n',
      truncated: false,
      exitStatus: { exitCode: 0, signal: null },
    })
    const waitSpy = vi.spyOn(bridge, 'terminalWaitForExit').mockResolvedValue({ exitCode: 0, signal: null })
    const killSpy = vi.spyOn(bridge, 'terminalKill').mockResolvedValue(undefined)
    const releaseSpy = vi.spyOn(bridge, 'terminalRelease').mockResolvedValue(undefined)
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')

    transport.listener({
      jsonrpc: '2.0',
      id: 60,
      method: 'terminal/create',
      params: { command: 'npm', args: ['test'], env: [{ name: 'CI', value: '1' }] },
    })
    await vi.waitFor(() => expect(transport.sent.some((item) => item.id === 60)).toBe(true))
    expect(createSpy).toHaveBeenCalled()

    transport.listener({ jsonrpc: '2.0', id: 61, method: 'terminal/output', params: { terminalId: 'term_9' } })
    await vi.waitFor(() => expect(outputSpy).toHaveBeenCalledWith('term_9'))

    transport.listener({ jsonrpc: '2.0', id: 62, method: 'terminal/wait_for_exit', params: { terminalId: 'term_9' } })
    await vi.waitFor(() => expect(waitSpy).toHaveBeenCalledWith('term_9'))

    transport.listener({ jsonrpc: '2.0', id: 63, method: 'terminal/kill', params: { terminalId: 'term_9' } })
    await vi.waitFor(() => expect(killSpy).toHaveBeenCalledWith('term_9'))

    transport.listener({ jsonrpc: '2.0', id: 64, method: 'terminal/release', params: { terminalId: 'term_9' } })
    await vi.waitFor(() => expect(releaseSpy).toHaveBeenCalledWith('term_9'))

    createSpy.mockRestore()
    outputSpy.mockRestore()
    waitSpy.mockRestore()
    killSpy.mockRestore()
    releaseSpy.mockRestore()
  })

  it('handles permission requests, replies, and cancel notifications', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')
    const events: unknown[] = []
    client.onEvent((event) => events.push(event))

    transport.listener({
      jsonrpc: '2.0',
      id: 77,
      method: 'session/request_permission',
      params: {
        toolCall: { toolCallId: 'call-7', title: '编辑文件' },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
        ],
      },
    })

    expect(events.at(-1)).toMatchObject({ kind: 'permission', requestId: 77, title: '编辑文件' })
    await client.respondPermission(77, { outcome: 'selected', optionId: 'allow-once' })
    expect(transport.sent.at(-1)).toEqual({
      jsonrpc: '2.0',
      id: 77,
      result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
    })

    await client.cancel()
    expect(transport.sent.at(-1)).toEqual({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: 'session-42' },
    })
  })

  it('reuses per-task sessions instead of recreating them', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo', 'task-a')
    await client.ensureSession('task-a')
    await client.ensureSession('task-b')
    expect(transport.sent.filter((message) => message.method === 'session/new')).toHaveLength(2)
    await client.ensureSession('task-a')
    expect(transport.sent.filter((message) => message.method === 'session/new')).toHaveLength(2)
  })

  it('loads live git diffs and terminal output through Grok extensions', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      const result = method === 'session/new' ? { sessionId: 'session-42' }
        : method === 'x.ai/git/status' ? { success: true, data: { branch: 'main', staged: [], unstaged: [{ path: 'src/App.tsx', type: 'edit', additions: 3, deletions: 1 }] } }
          : method === 'x.ai/git/diffs' ? { success: true, data: { files: [{ path: 'src/App.tsx', additions: 3, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }] } }
            : method === 'x.ai/terminal/list' ? { success: true, data: { terminals: [{ terminalId: 'term-1', status: 'connected', name: 'npm test' }] } }
              : method === 'x.ai/terminal/output' ? { success: true, data: { output: 'Tests: 1 passed', truncated: false, exitStatus: null } }
                : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ jsonrpc: '2.0', id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')

    await expect(client.loadWorkspaceData()).resolves.toMatchObject({
      branch: 'main',
      files: [{ path: 'src/App.tsx', additions: 3, deletions: 1 }],
      terminals: [{ terminalId: 'term-1', output: 'Tests: 1 passed' }],
      gitAvailable: true,
      gitSource: 'acp',
    })
    expect(transport.sent.map((message) => message.method)).toEqual([
      'initialize', 'session/new', 'x.ai/git/status', 'x.ai/git/diffs', 'x.ai/terminal/list', 'x.ai/terminal/output',
    ])
    expect(client.capabilities.gitExtension).toBe(true)
    expect(client.capabilities.terminalExtension).toBe(true)
  })

  it('falls back to local git when ACP git extensions are missing', async () => {
    const bridge = await import('./desktopBridge')
    const localSpy = vi.spyOn(bridge, 'gitWorkspaceStatus').mockResolvedValue({
      branch: 'feature/local',
      available: true,
      files: [{ path: 'local.ts', type: 'edit', additions: 1, deletions: 0, patch: '+x' }],
    })
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      if (method === 'x.ai/git/status' || method === 'x.ai/git/diffs' || method === 'x.ai/terminal/list') {
        queueMicrotask(() => transport.listener({
          id: message.id,
          error: { message: 'Method not found' },
        }))
        return
      }
      const result = method === 'session/new' ? { sessionId: 'session-42' } : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')
    await expect(client.loadWorkspaceData()).resolves.toEqual({
      branch: 'feature/local',
      files: [{ path: 'local.ts', type: 'edit', additions: 1, deletions: 0, patch: '+x' }],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: false,
      gitSource: 'local',
    })
    expect(localSpy).toHaveBeenCalled()
    expect(client.capabilities.gitExtension).toBe(false)
    localSpy.mockRestore()
  })

  it('falls back to status files and tolerates malformed extension data', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      transport.sent.push(message)
      const method = message.method
      const result = method === 'session/new' ? { sessionId: 'session-42' }
        : method === 'x.ai/git/status' ? {
            branch: 42,
            staged: [null, { path: 'old.ts', oldPath: 'previous.ts', type: 'edit', additions: '3', deletions: 2 }],
            unstaged: [{ nope: true }],
          }
          : method === 'x.ai/terminal/list' ? {
              data: { terminals: [null, { terminalId: 'term-2', status: 7, exitCode: 1 }] },
            }
            : method === 'x.ai/terminal/output' ? { data: { output: 99, truncated: true } }
              : { protocolVersion: 1 }
      queueMicrotask(() => transport.listener({ id: message.id, result }))
    }
    const client = new GrokAcpClient(transport)
    await client.connect('.')

    await expect(client.loadWorkspaceData()).resolves.toEqual({
      branch: undefined,
      files: [{ path: 'old.ts', oldPath: 'previous.ts', type: 'edit', additions: 0, deletions: 2, patch: undefined }],
      terminals: [{ terminalId: 'term-2', status: 'unknown', name: undefined, exitCode: 1, output: '', truncated: true }],
      gitAvailable: true,
      terminalAvailable: true,
      gitSource: 'acp',
    })
  })

  it('reports unavailable extensions and rejects workspace reads before connection', async () => {
    const bridge = await import('./desktopBridge')
    const localSpy = vi.spyOn(bridge, 'gitWorkspaceStatus').mockRejectedValue(new Error('浏览器预览'))
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    await expect(client.loadWorkspaceData()).rejects.toThrow('Grok 会话尚未建立')
    await client.connect('.')
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      queueMicrotask(() => transport.listener({ id: message.id, error: {} }))
    }
    await expect(client.loadWorkspaceData()).resolves.toEqual({
      branch: undefined,
      files: [],
      terminals: [],
      gitAvailable: false,
      terminalAvailable: false,
      gitSource: 'none',
    })
    localSpy.mockRestore()
  })

  it('forwards normalized streaming updates to subscribers', async () => {
    const transport = new FakeTransport()
    const client = new GrokAcpClient(transport)
    const subscriber = vi.fn()
    client.onEvent(subscriber)
    await client.connect('E:\\repo')

    transport.listener({
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: '完成' } } },
    })

    expect(subscriber).toHaveBeenCalledWith({ kind: 'message', text: '完成' })
    const unsubscribe = client.onEvent(subscriber)
    unsubscribe()
    transport.listener(null)
    transport.listener({ id: 999, result: {} })
  })

  it('rejects protocol errors and prompts before connection', async () => {
    const transport = new FakeTransport()
    transport.send = async (payload) => {
      const message = payload as Record<string, unknown>
      queueMicrotask(() => transport.listener({ id: message.id, error: { message: 'Unauthorized' } }))
    }
    const client = new GrokAcpClient(transport)

    await expect(client.prompt('hello')).rejects.toThrow('Grok 会话尚未建立')
    await expect(client.connect('E:\\repo')).rejects.toThrow('Unauthorized')
  })

  it('unsubscribes and stops the child process on disconnect', async () => {
    const transport = new FakeTransport()
    const unlisten = vi.fn()
    transport.listen = async (listener) => {
      transport.listener = listener
      return unlisten
    }
    const client = new GrokAcpClient(transport)
    await client.connect('E:\\repo')

    await client.disconnect()

    expect(unlisten).toHaveBeenCalledOnce()
    expect(transport.stopped).toBe(true)
  })

  it('rejects missing session ids, send failures, pending disconnects, and timeouts', async () => {
    const missingSession = new FakeTransport()
    missingSession.send = async (payload) => {
      const message = payload as Record<string, unknown>
      const result = message.method === 'session/new' ? {} : { protocolVersion: 1 }
      queueMicrotask(() => missingSession.listener({ id: message.id, result }))
    }
    await expect(new GrokAcpClient(missingSession).connect('.')).rejects.toThrow('Grok 未返回会话 ID')

    const sendFailure = new FakeTransport()
    sendFailure.send = async () => { throw 'offline' }
    await expect(new GrokAcpClient(sendFailure).connect('.')).rejects.toThrow('offline')

    const pending = new FakeTransport()
    pending.send = async (payload) => { pending.sent.push(payload as Record<string, unknown>) }
    const pendingClient = new GrokAcpClient(pending, 5_000)
    const connecting = pendingClient.connect('.')
    const disconnected = expect(connecting).rejects.toThrow('Grok 会话已关闭')
    await vi.waitFor(() => expect(pending.sent).toHaveLength(1))
    await pendingClient.disconnect()
    await disconnected

    vi.useFakeTimers()
    const timedOut = new FakeTransport()
    timedOut.send = async () => undefined
    const timeoutClient = new GrokAcpClient(timedOut, 10)
    const timedConnection = timeoutClient.connect('.')
    const timeoutExpectation = expect(timedConnection).rejects.toThrow('Grok 请求超时：initialize')
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(11)
    await timeoutExpectation
    vi.useRealTimers()
  })

  it('delegates the native transport operations to the desktop bridge in preview mode', async () => {
    const transport = new NativeGrokTransport()
    await expect(transport.start('.')).rejects.toBeDefined()
    await expect(transport.send({})).rejects.toBeDefined()
    await expect(transport.stop()).rejects.toBeDefined()
    const unlisten = await transport.listen(vi.fn())
    expect(unlisten()).toBeUndefined()
  })
})
