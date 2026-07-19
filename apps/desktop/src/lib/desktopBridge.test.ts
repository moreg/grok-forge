import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBackendStatus,
  gitRestoreFile,
  gitRestoreFiles,
  gitStageFiles,
  gitWorkspaceStatus,
  isTauriRuntime,
  listenForGrokEvents,
  listenForRawGrokEvents,
  listenForTerminalChunks,
  listenForTerminalExit,
  normalizeAcpEvent,
  parsePermissionRequest,
  readTextFile,
  selectFiles,
  selectWorkspace,
  sendGrokRpc,
  setWorkspace,
  startGrok,
  stopGrok,
  terminalCreate,
  terminalKill,
  terminalList,
  terminalOpenShell,
  terminalOutput,
  terminalRelease,
  terminalWaitForExit,
  terminalWrite,
  writeTextFile,
  type InvokeFn,
} from './desktopBridge'

const eventMocks = vi.hoisted(() => ({ listen: vi.fn(), open: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: eventMocks.listen }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: eventMocks.open }))

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  eventMocks.listen.mockReset()
  eventMocks.open.mockReset()
})

describe('desktop bridge', () => {
  it('reports preview mode when the UI is running outside Tauri', async () => {
    const invoke = vi.fn() as InvokeFn

    await expect(getBackendStatus(invoke, false)).resolves.toEqual({
      mode: 'preview',
      installed: true,
      version: 'Browser preview',
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reads the native Grok status through the Tauri command bridge', async () => {
    const invoke = vi.fn().mockResolvedValue({
      mode: 'native',
      installed: true,
      version: 'grok 1.2.3',
    }) as InvokeFn

    await expect(getBackendStatus(invoke, true)).resolves.toMatchObject({
      mode: 'native',
      installed: true,
    })
    expect(invoke).toHaveBeenCalledWith('grok_status')
  })

  it('starts the Grok ACP process with the selected workspace', async () => {
    const invoke = vi.fn().mockResolvedValue({ running: true, pid: 42 }) as InvokeFn

    await expect(startGrok('E:\\repo', invoke)).resolves.toEqual({ running: true, pid: 42 })
    expect(invoke).toHaveBeenCalledWith('start_grok', { cwd: 'E:\\repo' })
  })

  it('sends RPC messages and stops the native process', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ running: false }) as InvokeFn
    const payload = { jsonrpc: '2.0', method: 'initialize', id: 1 }

    await sendGrokRpc(payload, invoke)
    await expect(stopGrok(invoke)).resolves.toEqual({ running: false })
    expect(invoke).toHaveBeenNthCalledWith(1, 'send_grok_rpc', { payload })
    expect(invoke).toHaveBeenNthCalledWith(2, 'stop_grok')
  })

  it('reads and writes text files through the native bridge', async () => {
    await expect(readTextFile('a.ts', undefined, vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(writeTextFile('a.ts', 'x', vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')

    const invoke = vi.fn()
      .mockResolvedValueOnce({ content: 'hello' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined) as InvokeFn
    await expect(readTextFile('a.ts', { line: 1, limit: 2 }, invoke, true)).resolves.toBe('hello')
    await writeTextFile('a.ts', 'world', invoke, true)
    await setWorkspace('E:\\repo', invoke)
    expect(invoke).toHaveBeenNthCalledWith(1, 'read_text_file', { path: 'a.ts', line: 1, limit: 2 })
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_text_file', { path: 'a.ts', content: 'world' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'set_workspace', { cwd: 'E:\\repo' })
  })

  it('bridges git restore, workspace status, and local terminal lifecycle calls', async () => {
    await expect(gitRestoreFile('a.ts', vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(gitRestoreFiles(['a.ts'], vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(gitStageFiles(['a.ts'], vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(gitWorkspaceStatus(vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(terminalCreate({ command: 'echo' }, vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(terminalOpenShell(undefined, vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')
    await expect(terminalWrite('t1', 'hi', vi.fn() as InvokeFn, false)).rejects.toThrow('浏览器预览')

    const invoke = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        results: [{ path: 'src/a.ts', ok: true }, { path: 'src/b.ts', ok: false, error: 'nope' }],
        succeeded: 1,
        failed: 1,
      })
      .mockResolvedValueOnce({
        results: [{ path: 'src/a.ts', ok: true }],
        succeeded: 1,
        failed: 0,
      })
      .mockResolvedValueOnce({
        branch: 'main',
        available: true,
        files: [{ path: 'src/a.ts', type: 'edit', additions: 2, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }],
      })
      .mockResolvedValueOnce({ terminalId: 'term_1' })
      .mockResolvedValueOnce({ terminalId: 'shell_1' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ output: 'ok', truncated: false, exitStatus: { exitCode: 0, signal: null } })
      .mockResolvedValueOnce({ exitCode: 0, signal: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{
        terminalId: 'term_1', name: 'npm test', status: 'running', output: 'x', truncated: false, interactive: true,
      }])

    await gitRestoreFile('src/a.ts', invoke as InvokeFn, true)
    await expect(gitRestoreFiles(['src/a.ts', 'src/b.ts', ''], invoke as InvokeFn, true)).resolves.toMatchObject({
      succeeded: 1,
      failed: 1,
    })
    await expect(gitStageFiles(['src/a.ts'], invoke as InvokeFn, true)).resolves.toMatchObject({ succeeded: 1 })
    await expect(gitWorkspaceStatus(invoke as InvokeFn, true)).resolves.toMatchObject({
      branch: 'main',
      available: true,
      files: [{ path: 'src/a.ts', additions: 2, deletions: 1 }],
    })
    await expect(terminalCreate({ command: 'npm', args: ['test'] }, invoke as InvokeFn, true)).resolves.toBe('term_1')
    await expect(terminalOpenShell('E:\\repo', invoke as InvokeFn, true)).resolves.toBe('shell_1')
    await terminalWrite('shell_1', 'Get-ChildItem', invoke as InvokeFn, true)
    await expect(terminalOutput('term_1', invoke as InvokeFn, true)).resolves.toMatchObject({ output: 'ok' })
    await expect(terminalWaitForExit('term_1', invoke as InvokeFn, true)).resolves.toMatchObject({ exitCode: 0 })
    await terminalKill('term_1', invoke as InvokeFn, true)
    await terminalRelease('term_1', invoke as InvokeFn, true)
    await expect(terminalList(invoke as InvokeFn, true)).resolves.toEqual([
      expect.objectContaining({ terminalId: 'term_1', interactive: true }),
    ])
    await expect(terminalList(vi.fn() as InvokeFn, false)).resolves.toEqual([])

    expect(invoke).toHaveBeenNthCalledWith(1, 'git_restore_file', { path: 'src/a.ts' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'git_restore_files', { paths: ['src/a.ts', 'src/b.ts'] })
    expect(invoke).toHaveBeenNthCalledWith(3, 'git_stage_files', { paths: ['src/a.ts'] })
    expect(invoke).toHaveBeenNthCalledWith(4, 'git_workspace_status')
    expect(invoke).toHaveBeenNthCalledWith(5, 'terminal_create', {
      command: 'npm',
      args: ['test'],
      cwd: undefined,
      env: undefined,
      outputByteLimit: undefined,
      interactive: false,
    })
    expect(invoke).toHaveBeenNthCalledWith(6, 'terminal_open_shell', { cwd: 'E:\\repo' })
    expect(invoke).toHaveBeenNthCalledWith(7, 'terminal_write', { terminalId: 'shell_1', data: 'Get-ChildItem' })
  })

  it('uses a no-op listener in browser preview mode', async () => {
    expect(isTauriRuntime()).toBe(false)
    const unlisten = await listenForGrokEvents(vi.fn())
    expect(unlisten()).toBeUndefined()
    expect((await listenForTerminalChunks(vi.fn()))()).toBeUndefined()
    expect((await listenForTerminalExit(vi.fn()))()).toBeUndefined()
  })

  it('forwards terminal chunk and exit events in the native runtime', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const unlisten = vi.fn()
    eventMocks.listen.mockImplementation(async (name, listener) => {
      if (name === 'grok://terminal-chunk') {
        listener({ payload: { terminalId: 't1', chunk: 'hi' } })
      }
      if (name === 'grok://terminal-exit') {
        listener({ payload: { terminalId: 't1' } })
      }
      return unlisten
    })
    const onChunk = vi.fn()
    const onExit = vi.fn()
    expect(await listenForTerminalChunks(onChunk)).toBe(unlisten)
    expect(await listenForTerminalExit(onExit)).toBe(unlisten)
    expect(onChunk).toHaveBeenCalledWith({ terminalId: 't1', chunk: 'hi' })
    expect(onExit).toHaveBeenCalledWith({ terminalId: 't1' })
  })

  it('selects directories and files only in the native runtime', async () => {
    await expect(selectWorkspace('C:\\repo')).resolves.toBeNull()
    await expect(selectFiles('C:\\repo')).resolves.toEqual([])
    expect(eventMocks.open).not.toHaveBeenCalled()

    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    eventMocks.open
      .mockResolvedValueOnce('D:\\project')
      .mockResolvedValueOnce(['invalid'])
      .mockResolvedValueOnce('E:\\one.ts')
      .mockResolvedValueOnce(['E:\\a.ts', 'E:\\b.ts'])
      .mockResolvedValueOnce(null)
    await expect(selectWorkspace('C:\\repo')).resolves.toBe('D:\\project')
    await expect(selectWorkspace()).resolves.toBeNull()
    await expect(selectFiles('C:\\repo')).resolves.toEqual(['E:\\one.ts'])
    await expect(selectFiles()).resolves.toEqual(['E:\\a.ts', 'E:\\b.ts'])
    await expect(selectFiles()).resolves.toEqual([])
    expect(eventMocks.open).toHaveBeenCalledWith({ directory: true, multiple: false, defaultPath: 'C:\\repo' })
  })

  it('forwards raw and normalized events in the native runtime', async () => {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const unlisten = vi.fn()
    eventMocks.listen.mockImplementation(async (_name, listener) => {
      listener({ payload: {
        method: 'session/update',
        params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Live' } } },
      } })
      return unlisten
    })
    const normalized = vi.fn()
    const raw = vi.fn()

    expect(await listenForGrokEvents(normalized)).toBe(unlisten)
    expect(await listenForRawGrokEvents(raw)).toBe(unlisten)
    expect(normalized).toHaveBeenCalledWith({ kind: 'message', text: 'Live' })
    expect(raw).toHaveBeenCalled()
  })

  it('normalizes streamed ACP tool and message updates for the UI', () => {
    expect(normalizeAcpEvent({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'Run tests',
          status: 'in_progress',
          kind: 'execute',
          locations: [{ path: 'src/a.ts' }],
        },
      },
    })).toEqual({
      kind: 'tool',
      toolCallId: 'call-1',
      title: 'Run tests',
      status: 'in_progress',
      toolKind: 'execute',
      detail: 'src/a.ts',
      paths: ['src/a.ts'],
    })

    expect(normalizeAcpEvent({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Done' } } },
    })).toEqual({ kind: 'message', text: 'Done' })
  })

  it('ignores unknown ACP payloads safely', () => {
    expect(normalizeAcpEvent({ method: 'unknown' })).toBeNull()
    expect(normalizeAcpEvent({ method: 'session/update', params: {} })).toBeNull()
    expect(normalizeAcpEvent(null)).toBeNull()
  })

  it('normalizes thoughts, plans, and incomplete tool updates', () => {
    expect(normalizeAcpEvent({ method: 'x.ai/git_head_changed', params: {} })).toEqual({ kind: 'workspace' })
    expect(normalizeAcpEvent({
      method: 'x.ai/session/update',
      params: { update: { sessionUpdate: 'agent_thought_chunk', content: { text: 'Inspecting' } } },
    })).toEqual({ kind: 'thought', text: 'Inspecting' })
    expect(normalizeAcpEvent({
      method: 'session/update',
      params: { update: { sessionUpdate: 'plan', entries: [{ text: 'Test' }] } },
    })).toEqual({ kind: 'plan', entries: [{ text: 'Test' }] })
    expect(normalizeAcpEvent({
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call' } },
    })).toEqual({ kind: 'tool', title: 'Grok tool', status: 'pending' })
    expect(normalizeAcpEvent({
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: null } },
    })).toEqual({ kind: 'message', text: '' })
    expect(normalizeAcpEvent({
      method: 'session/update',
      params: { update: { sessionUpdate: 'plan', entries: null } },
    })).toEqual({ kind: 'plan', entries: [] })
  })

  it('parses permission requests from the agent', () => {
    expect(parsePermissionRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'session/request_permission',
      params: {
        toolCall: { toolCallId: 'call-9', title: '写入文件' },
        options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
      },
    })).toEqual({
      kind: 'permission',
      requestId: 9,
      toolCallId: 'call-9',
      title: '写入文件',
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
    })
  })

  it('extracts tool details from raw input, content blocks, and updates', () => {
    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call-2',
          status: 'completed',
          title: '搜索代码',
          rawInput: { query: 'login timeout' },
        },
      },
    })).toMatchObject({ kind: 'tool', detail: 'login timeout', status: 'completed' })

    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          title: '写文件',
          status: 'pending',
          rawInput: { path: 'src/x.ts' },
        },
      },
    })).toMatchObject({ detail: 'src/x.ts' })

    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          title: '跑命令',
          status: 'pending',
          rawInput: { command: 'npm test' },
        },
      },
    })).toMatchObject({ detail: 'npm test' })

    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          title: 'diff',
          status: 'completed',
          content: [{ type: 'diff', path: 'a.ts', newText: 'x' }],
        },
      },
    })).toMatchObject({ detail: 'a.ts' })

    expect(parsePermissionRequest({ method: 'other' })).toBeNull()
    expect(parsePermissionRequest({
      id: 3,
      method: 'session/request_permission',
      params: { toolCall: { toolCallId: 'c1' }, options: [null] },
    })).toMatchObject({ title: '工具调用 c1' })

    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          title: '分析',
          status: 'pending',
          content: 'direct string content',
        },
      },
    })).toMatchObject({ detail: 'direct string content' })

    expect(normalizeAcpEvent({
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          title: '分析',
          status: 'pending',
          content: [{ type: 'content', content: { type: 'text', text: '  found issues  ' } }],
        },
      },
    })).toMatchObject({ detail: 'found issues' })

    expect(normalizeAcpEvent({ kind: 'permission', requestId: 1, title: 'x', options: [] })).toMatchObject({
      kind: 'permission',
      requestId: 1,
    })
  })
})
