import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as bridge from './lib/desktopBridge'
import App from './App'

/** Wait one macrotask so rAF-mapped stream token batches flush in jsdom. */
async function flushStreamBatch() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

const acpMocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue({ sessionId: 'session-42' }),
  prompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
  promptBlocks: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
  loadWorkspaceData: vi.fn().mockResolvedValue({ branch: 'main', files: [], terminals: [] }),
  fetchBilling: vi.fn().mockResolvedValue(null),
  disconnect: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn().mockResolvedValue(undefined),
  respondPermission: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn(),
  setAccountId: vi.fn(),
  setTaskAccountId: vi.fn(),
  setMcpServers: vi.fn(),
  setPreferredModel: vi.fn(),
  setSessionModel: vi.fn().mockResolvedValue({}),
  preferredModel: null as string | null,
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('grok-forge-accounts', JSON.stringify({
    accounts: [{
      id: 'acc-test-1234',
      name: '测试账号',
      source: 'import',
      renewal: 'unknown',
      authStatus: 'valid',
      createdAt: 1,
      lastUsedAt: 1,
    }],
    currentAccountId: 'acc-test-1234',
  }))
  localStorage.setItem('grok-forge-tasks', JSON.stringify([{
    id: 'task-test-default',
    accountId: 'acc-test-1234',
    title: '准备开始',
    messages: [],
    liveMessage: '',
    liveThought: '',
    liveEvents: [],
    planSteps: [],
    status: 'idle',
    updatedAt: 1,
    sessionKey: 'task-test-default',
    attachments: [],
    tags: [],
  }]))
  localStorage.setItem('grok-forge-active-task', 'task-test-default')
  // Opt out of open-to-connect in most tests so they keep an explicit “连接 Grok” step.
  // Dedicated auto-connect coverage clears this key or sets it to '1'.
  localStorage.setItem('grok-forge-auto-reconnect', '0')
  vi.clearAllMocks()
  vi.useRealTimers()
  acpMocks.connect.mockResolvedValue({ sessionId: 'session-42', restored: false })
  acpMocks.prompt.mockResolvedValue({ stopReason: 'end_turn' })
  acpMocks.promptBlocks.mockResolvedValue({ stopReason: 'end_turn' })
  acpMocks.cancel.mockResolvedValue(undefined)
  acpMocks.respondPermission.mockResolvedValue(undefined)
  acpMocks.setSessionModel.mockResolvedValue({})
  acpMocks.preferredModel = null
  acpMocks.setPreferredModel.mockImplementation((modelId: string | null | undefined) => {
    acpMocks.preferredModel = modelId?.trim() || null
  })
  acpMocks.setSessionModel.mockImplementation(async (modelId: string) => {
    acpMocks.preferredModel = modelId
    return { applied: true, mode: 'session', message: '已切换当前会话模型' }
  })
  acpMocks.loadWorkspaceData.mockResolvedValue({
    branch: 'main', files: [], terminals: [], gitAvailable: true, terminalAvailable: true,
  })
  acpMocks.fetchBilling.mockResolvedValue(null)
  vi.mocked(bridge.getBackendStatus).mockResolvedValue({
    mode: 'preview', installed: true, version: 'Browser preview',
  })
  vi.mocked(bridge.gitRestoreFile).mockResolvedValue(undefined)
  vi.mocked(bridge.gitRestoreFiles).mockImplementation(async (paths: string[]) => ({
    results: paths.map((path) => ({ path, ok: true })),
    succeeded: paths.length,
    failed: 0,
  }))
  vi.mocked(bridge.gitStageFiles).mockImplementation(async (paths: string[]) => ({
    results: paths.map((path) => ({ path, ok: true })),
    succeeded: paths.length,
    failed: 0,
  }))
  vi.mocked(bridge.gitCommit).mockImplementation(async (message: string) => ({
    ok: true,
    message,
  }))
  vi.mocked(bridge.readTextFile).mockResolvedValue('keep\nnew\ntail\n')
  vi.mocked(bridge.writeTextFile).mockResolvedValue(undefined)
  vi.mocked(bridge.terminalList).mockResolvedValue([])
  vi.mocked(bridge.terminalKill).mockResolvedValue(undefined)
  vi.mocked(bridge.terminalOpenShell).mockResolvedValue('shell-1')
  vi.mocked(bridge.terminalWrite).mockResolvedValue(undefined)
  vi.mocked(bridge.selectFiles).mockResolvedValue([])
  vi.mocked(bridge.selectWorkspace).mockResolvedValue(null)
})

vi.mock('./lib/desktopBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/desktopBridge')>()
  return {
    ...actual,
    getBackendStatus: vi.fn().mockResolvedValue({ mode: 'preview', installed: true, version: 'Browser preview' }),
    selectWorkspace: vi.fn().mockResolvedValue(null),
    selectFiles: vi.fn().mockResolvedValue([]),
    gitRestoreFile: vi.fn().mockResolvedValue(undefined),
    gitRestoreFiles: vi.fn().mockImplementation(async (paths: string[]) => ({
      results: paths.map((path) => ({ path, ok: true })),
      succeeded: paths.length,
      failed: 0,
    })),
    gitStageFiles: vi.fn().mockImplementation(async (paths: string[]) => ({
      results: paths.map((path) => ({ path, ok: true })),
      succeeded: paths.length,
      failed: 0,
    })),
    gitCommit: vi.fn().mockImplementation(async (message: string) => ({
      ok: true,
      message,
    })),
    readTextFile: vi.fn().mockResolvedValue('keep\nnew\ntail\n'),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    terminalList: vi.fn().mockResolvedValue([]),
    terminalKill: vi.fn().mockResolvedValue(undefined),
    terminalOpenShell: vi.fn().mockResolvedValue('shell-1'),
    terminalWrite: vi.fn().mockResolvedValue(undefined),
    listenForTerminalChunks: vi.fn().mockResolvedValue(() => undefined),
    listenForTerminalExit: vi.fn().mockResolvedValue(() => undefined),
  }
})

vi.mock('./lib/grokAcpClient', () => ({
  BILLING_POLL_INTERVAL_MS: 120_000,
  GrokRequestError: class GrokRequestError extends Error {},
  GrokAcpClient: class MockGrokAcpClient {
    connect = acpMocks.connect
    prompt = acpMocks.prompt
    promptBlocks = acpMocks.promptBlocks
    loadWorkspaceData = acpMocks.loadWorkspaceData
    fetchBilling = acpMocks.fetchBilling
    disconnect = acpMocks.disconnect
    cancel = acpMocks.cancel
    respondPermission = acpMocks.respondPermission
    onEvent = acpMocks.onEvent
    setAccountId = acpMocks.setAccountId
    setTaskAccountId = acpMocks.setTaskAccountId
    setMcpServers = acpMocks.setMcpServers
    setPreferredModel = acpMocks.setPreferredModel
    setSessionModel = acpMocks.setSessionModel
    get preferredModel() {
      return acpMocks.preferredModel
    }
  },
}))

describe('Grok Forge workspace', () => {
  it('shows the five MVP surfaces', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: '工作区' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('准备开始')
    expect(screen.getByRole('region', { name: '变更审阅' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /终端/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '任务输入' })).toBeInTheDocument()
    // Context meter is always visible (local estimate until agent reports usage_update).
    expect(screen.getByRole('meter', { name: '当前对话上下文容量' })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: '当前对话上下文容量' })).toHaveTextContent('估算')
  })

  it('makes the browser-only runtime state explicit', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: '浏览器预览' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /api\.ts/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('空审阅状态')).toHaveTextContent('连接 Grok 后将在这里显示实时 Git 变更。')
  })

  it('auto-connects on open when native workspace is ready', async () => {
    localStorage.removeItem('grok-forge-auto-reconnect')
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native',
      installed: true,
      version: 'grok 1.0.0',
      workspacePath: 'E:\\trea\\grok桌面版',
    })
    render(<App />)

    expect(await screen.findByRole('button', { name: '断开 Grok' })).toBeInTheDocument()
    expect(acpMocks.connect).toHaveBeenCalledWith('E:\\trea\\grok桌面版', expect.any(String), expect.any(Array), undefined)
    expect(acpMocks.loadWorkspaceData).toHaveBeenCalled()
    expect(screen.getByText(/已连接 Grok，直接输入你的第一个任务/)).toBeInTheDocument()
  })

  it('does not connect an unowned task until it is bound', async () => {
    localStorage.removeItem('grok-forge-auto-reconnect')
    localStorage.setItem('grok-forge-accounts', JSON.stringify({
      accounts: [{
        id: 'acc-test-1234',
        name: '测试账号',
        source: 'import',
        renewal: 'unknown',
        authStatus: 'valid',
        createdAt: 1,
        lastUsedAt: 1,
      }],
      currentAccountId: 'acc-test-1234',
    }))
    localStorage.setItem('grok-forge-tasks', JSON.stringify([{
      id: 'task-test-default',
      accountId: null,
      title: '准备开始',
      messages: [],
      liveMessage: '',
      liveThought: '',
      liveEvents: [],
      planSteps: [],
      status: 'idle',
      updatedAt: 1,
      sessionKey: 'task-test-default',
      attachments: [],
      tags: [],
    }]))
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native',
      installed: true,
      version: 'grok 1.0.0',
      workspacePath: 'E:\\trea\\grok桌面版',
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<App />)

    await flushStreamBatch()
    expect(acpMocks.connect).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '切换到任务 准备开始' }))
    await screen.findByRole('button', { name: '断开 Grok' })
    expect(acpMocks.connect).toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('connects the installed Grok runtime from a native window', async () => {
    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native',
      installed: true,
      version: 'grok 1.0.0',
      workspacePath: 'E:\\trea\\grok桌面版',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(await screen.findByRole('button', { name: '断开 Grok' })).toBeInTheDocument()
    expect(acpMocks.connect).toHaveBeenCalledWith('E:\\trea\\grok桌面版', expect.any(String), expect.any(Array), undefined)
    expect(acpMocks.loadWorkspaceData).toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '读取当前项目')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(acpMocks.promptBlocks).toHaveBeenCalled()

    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      // Thought tokens must concatenate into one block, not one row per chunk.
      receive({ kind: 'thought', text: 'The ' })
      receive({ kind: 'thought', text: 'user ' })
      receive({ kind: 'thought', text: 'just sent' })
      receive({ kind: 'tool', title: '读取文件', status: 'in_progress' })
      receive({ kind: 'plan', entries: [{ text: '完成' }] })
      receive({ kind: 'message', text: '真实回复' })
    })
    await flushStreamBatch()
    const live = screen.getByRole('region', { name: 'Grok 实时回复' })
    expect(live).toHaveTextContent('The user just sent')
    expect(live).toHaveTextContent('真实回复')
    expect(screen.getByLabelText('Grok 思考中')).toHaveTextContent('The user just sent')
    // One thought block only — not one bubble per token.
    expect(screen.getAllByLabelText('Grok 思考中')).toHaveLength(1)
    // Reply started → thought stream auto-folds so the answer stays visible.
    expect(screen.getByRole('button', { name: '展开思考过程' })).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: '展开思考过程' }))
    expect(screen.getByRole('button', { name: '折叠思考过程' })).toHaveAttribute('aria-expanded', 'true')

    act(() => {
      receive({ kind: 'usage', used: 53_000, size: 200_000 })
    })
    const meter = screen.getByRole('meter', { name: '当前对话上下文容量' })
    expect(meter).toHaveTextContent('实时')
    expect(meter).toHaveTextContent('53k')
    expect(meter).toHaveTextContent('200k')

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
  })

  it('archives the assistant reply after the prompt finishes', async () => {
    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '总结改动')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({ kind: 'thought', text: '整理要点' })
      receive({ kind: 'tool', title: '读取 diff', status: 'completed' })
      receive({ kind: 'plan', entries: [{ text: '总结' }] })
      receive({ kind: 'message', text: '改动已总结' })
    })
    await flushStreamBatch()
    expect(screen.getByRole('region', { name: 'Grok 实时回复' })).toHaveTextContent('改动已总结')
    expect(screen.getByLabelText('Grok 思考中')).toHaveTextContent('整理要点')

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
    // Finalize must clear live shell even when tool/plan events were streamed.
    expect(screen.queryByRole('region', { name: 'Grok 实时回复' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Grok 回复')).toHaveTextContent('改动已总结')
  })

  it('collapses the live tool list so long chains do not flood the chat', async () => {
    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '跑一串工具')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({ kind: 'tool', toolCallId: 't1', title: 'Grok tool', detail: 'Failed to read file', status: 'failed' })
      receive({ kind: 'tool', toolCallId: 't2', title: 'Grok tool', detail: 'found 36 matches', status: 'completed' })
      receive({ kind: 'tool', toolCallId: 't3', title: 'Grok tool', detail: 'found 63 matches', status: 'completed' })
      receive({ kind: 'message', text: '工具链路结束' })
    })
    await flushStreamBatch()

    const toolsRegion = screen.getByRole('region', { name: '工具调用' })
    expect(toolsRegion).toBeInTheDocument()
    // Collapsed by default when reply starts — detail rows stay out of the stream.
    expect(screen.getByRole('button', { name: '展开工具调用' })).toHaveAttribute('aria-expanded', 'false')
    expect(toolsRegion).toHaveTextContent('2/3 完成 · 1 失败')
    expect(toolsRegion).not.toHaveTextContent('found 36 matches')

    await user.click(screen.getByRole('button', { name: '展开工具调用' }))
    expect(screen.getByRole('button', { name: '折叠工具调用' })).toHaveAttribute('aria-expanded', 'true')
    expect(toolsRegion).toHaveTextContent('found 36 matches')
    expect(toolsRegion).toHaveTextContent('Failed to read file')

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
  })

  it('lets the user choose a workspace before connecting', async () => {
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\old',
    })
    vi.mocked(bridge.selectWorkspace).mockResolvedValueOnce('D:\\projects\\next')
    const user = userEvent.setup()
    render(<App />)

    // Current workspace is not a folder-picker trigger; use the + action instead.
    expect(await screen.findByLabelText('当前工作区')).toHaveTextContent('old')
    await user.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(bridge.selectWorkspace).toHaveBeenCalledWith('C:\\old')
    // Sidebar shows full path; header meta shows the short folder name.
    expect(screen.getByText('D:\\projects\\next')).toBeInTheDocument()
    expect(screen.getAllByText('next').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '连接 Grok' }))
    expect(acpMocks.connect).toHaveBeenCalledWith('D:\\projects\\next', expect.any(String), expect.any(Array), undefined)
  })

  it('collapses and expands the recent task list from the workspace chevron', async () => {
    localStorage.removeItem('grok-forge-conversations-collapsed')
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByLabelText('任务统计摘要')).toBeInTheDocument()
    const collapseButtons = screen.getAllByRole('button', { name: '收起最近任务' })
    expect(collapseButtons[0]).toHaveAttribute('aria-expanded', 'true')

    await user.click(collapseButtons[0])
    expect(screen.queryByLabelText('任务统计摘要')).not.toBeInTheDocument()
    expect(localStorage.getItem('grok-forge-conversations-collapsed')).toBe('1')
    expect(screen.getAllByRole('button', { name: '展开最近任务' })[0]).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getAllByRole('button', { name: '展开最近任务' })[0])
    expect(screen.getByLabelText('任务统计摘要')).toBeInTheDocument()
    expect(localStorage.getItem('grok-forge-conversations-collapsed')).toBe('0')
  })

  it('shows connection and prompt failures to the user', async () => {
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    acpMocks.connect.mockRejectedValueOnce(new Error('无法启动 Grok'))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法启动 Grok')

    acpMocks.connect.mockResolvedValueOnce({ sessionId: 'session-42' })
    await user.click(screen.getByRole('button', { name: '连接 Grok' }))
    acpMocks.promptBlocks.mockRejectedValueOnce(new Error('发送失败'))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '执行任务')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
  })

  it('renders live extension changes instead of the former sample diff', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValueOnce({
      branch: 'main',
      files: [{ path: 'src/live.ts', additions: 2, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }],
      terminals: [{ terminalId: 'term-1', status: 'connected', name: 'npm test', output: '1 passed', truncated: false }],
    })
    const user = userEvent.setup()
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(await screen.findByRole('button', { name: '查看 live.ts' }))
    const review = screen.getByRole('region', { name: '变更审阅' })
    expect(within(review).getByText('src/live.ts')).toBeInTheDocument()
    expect(within(review).getByText(/new/)).toBeInTheDocument()
  })

  it('submits a new task into the conversation', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByRole('textbox', { name: '任务输入' })
    await user.type(input, '运行完整测试')
    await user.click(screen.getByRole('button', { name: '发送任务' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('运行完整测试')
    expect(screen.getByRole('button', { name: '切换到任务 运行完整测试' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('运行完整测试')
    expect(input).toHaveValue('')
  })

  it('creates, searches, and switches tasks with persistence', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '修复登录超时')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(screen.getByRole('button', { name: '切换到任务 修复登录超时' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('准备开始')
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '重构设置页')
    await user.click(screen.getByRole('button', { name: '发送任务' }))

    await user.type(screen.getByRole('textbox', { name: '搜索任务' }), '登录')
    expect(screen.getByRole('button', { name: '切换到任务 修复登录超时' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '切换到任务 重构设置页' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: '搜索任务' }))
    await user.click(screen.getByRole('button', { name: '切换到任务 修复登录超时' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('修复登录超时')
    expect(screen.getByRole('main')).toHaveTextContent('修复登录超时')

    unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: '切换到任务 修复登录超时' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换到任务 重构设置页' })).toBeInTheDocument()
  })

  it('shows plan timeline, change summary, and approval mode switching', async () => {
    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [{ path: 'src/live.ts', additions: 2, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '执行修复')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({
        kind: 'plan',
        entries: [
          { content: '分析链路', status: 'completed' },
          { content: '写入修复', status: 'in_progress', detail: 'src/live.ts' },
        ],
      })
      receive({ kind: 'tool', title: '编辑文件', status: 'completed' })
      receive({ kind: 'message', text: '已完成修改' })
    })
    await flushStreamBatch()

    // Timeline stays collapsed by default so plan/tool noise does not flood the chat.
    expect(screen.getByRole('button', { name: '展开执行过程' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: '执行时间线' })).not.toHaveTextContent('分析链路')
    expect(screen.getByRole('button', { name: '查看改动摘要' })).toHaveTextContent('1 个文件')

    await user.click(screen.getByRole('button', { name: '展开执行过程' }))
    expect(screen.getByRole('button', { name: '折叠执行过程' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: '执行时间线' })).toHaveTextContent('分析链路')
    expect(screen.getByRole('region', { name: '执行时间线' })).toHaveTextContent('写入修复')

    await user.click(screen.getByRole('button', { name: '折叠执行过程' }))
    expect(screen.getByRole('button', { name: '展开执行过程' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: '执行时间线' })).not.toHaveTextContent('分析链路')

    await user.click(screen.getByRole('button', { name: '切换审批模式' }))
    await user.click(screen.getByRole('menuitemradio', { name: /观察模式/ }))
    expect(screen.getByRole('button', { name: '切换审批模式' })).toHaveTextContent('观察模式')
    expect(screen.getByText(/观察模式下会自动允许权限请求/)).toBeInTheDocument()

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
  })

  it('keeps the execution timeline collapsed while steps run and after they finish', async () => {
    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    vi.mocked(bridge.getBackendStatus).mockResolvedValueOnce({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '跑完整链路')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({
        kind: 'plan',
        entries: [
          { content: '步骤一', status: 'completed' },
          { content: '步骤二', status: 'in_progress' },
        ],
      })
    })
    expect(screen.getByRole('button', { name: '展开执行过程' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: '执行时间线' })).toHaveTextContent('步骤二')
    expect(screen.getByRole('region', { name: '执行时间线' })).not.toHaveTextContent('步骤一')

    act(() => {
      receive({
        kind: 'plan',
        entries: [
          { content: '步骤一', status: 'completed' },
          { content: '步骤二', status: 'completed' },
        ],
      })
    })
    expect(screen.getByRole('button', { name: '展开执行过程' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: '执行时间线' })).not.toHaveTextContent('步骤一')

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
  })

  it('applies the reviewed changes and updates status', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [{ path: 'src/live.ts', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+live' }],
      terminals: [], gitAvailable: true, terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(screen.getByRole('button', { name: '确认审阅' }))
    expect(bridge.gitStageFiles).toHaveBeenCalledWith(['src/live.ts'])
    expect(screen.getByText('已确认并暂存')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认审阅' })).toBeDisabled()
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('暂存')
  })

  it('restores all files locally when requesting bulk revert', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [
        { path: 'a.ts', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+a' },
        { path: 'b.ts', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+b' },
      ],
      terminals: [], gitAvailable: true, terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(screen.getByRole('button', { name: '请求撤销' }))
    expect(bridge.gitRestoreFiles).toHaveBeenCalledWith(['a.ts', 'b.ts'])
    expect(screen.getByText(/已处理撤销|已尝试本地还原/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('还原')
  })

  it('explains rejection in preview and can close the review pane', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: '请求撤销' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认审阅' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '关闭审阅面板' }))
    expect(screen.queryByRole('region', { name: '变更审阅' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开审阅面板' }))
    expect(screen.getByRole('region', { name: '变更审阅' })).toBeInTheDocument()
  })

  it('supports slash commands, task menu, settings and extensions panels', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '/help')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(screen.getByLabelText('系统消息')).toHaveTextContent('/new')

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '保留这条消息')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(screen.getByRole('main')).toHaveTextContent('保留这条消息')
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '/clear')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('准备开始')
    expect(screen.getByRole('main')).not.toHaveTextContent('保留这条消息')

    await user.click(screen.getByRole('button', { name: '任务选项' }))
    await user.click(screen.getByRole('menuitem', { name: '重命名任务' }))
    const rename = screen.getByRole('textbox', { name: '重命名任务' })
    await user.clear(rename)
    await user.type(rename, '新标题任务')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('新标题任务')

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('dialog', { name: '设置' })).toHaveTextContent('浏览器预览')
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    await user.click(screen.getByRole('button', { name: '能力诊断' }))
    expect(screen.getByRole('dialog', { name: '能力诊断' })).toHaveTextContent('x.ai/git/*')
    expect(screen.getByRole('dialog', { name: '能力诊断' })).toHaveTextContent('MCP 模板')
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    await user.click(screen.getByRole('button', { name: '附加内容' }))
    await user.click(screen.getByRole('button', { name: /\/review/ }))
    expect(screen.getByRole('textbox', { name: '任务输入' })).toHaveValue('/review')
  })

  it('handles approval prompts, stop control, branch display, and revert requests', async () => {
    acpMocks.promptBlocks.mockImplementation(() => new Promise(() => undefined))
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'feature/login',
      files: [{ path: 'src/auth.ts', additions: 2, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })

    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(screen.getByRole('main')).toHaveTextContent('feature/login')

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '修复登录')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(await screen.findByRole('button', { name: '停止任务' })).toBeInTheDocument()

    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({
        kind: 'tool',
        toolCallId: 'call-1',
        title: '编辑 auth.ts',
        status: 'in_progress',
        detail: 'src/auth.ts',
        toolKind: 'edit',
      })
      receive({
        kind: 'permission',
        requestId: 12,
        toolCallId: 'call-1',
        title: '写入 src/auth.ts',
        options: [
          { optionId: 'allow-once', name: '允许一次', kind: 'allow_once' },
          { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' },
        ],
      })
    })

    expect(screen.getByRole('region', { name: '执行时间线' })).toHaveTextContent('编辑 auth.ts')
    expect(screen.getByRole('alertdialog', { name: '权限审批' })).toHaveTextContent('写入 src/auth.ts')
    await user.click(screen.getByRole('button', { name: '允许一次' }))
    expect(acpMocks.respondPermission).toHaveBeenCalledWith(12, {
      outcome: 'selected',
      optionId: 'allow-once',
    })

    act(() => {
      receive({ kind: 'thought', text: '准备改 auth' })
      receive({ kind: 'message', text: '正在编辑…' })
    })
    await flushStreamBatch()
    expect(screen.getByRole('region', { name: 'Grok 实时回复' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '停止任务' }))
    expect(acpMocks.cancel).toHaveBeenCalled()
    // Stop finalizes/clears the live stream so thought/message shells do not stick.
    expect(screen.queryByRole('region', { name: 'Grok 实时回复' })).not.toBeInTheDocument()
    expect(screen.getByText('已请求停止当前执行。')).toBeInTheDocument()
    expect(screen.getByLabelText('Grok 回复')).toHaveTextContent('正在编辑…')

    await user.click(screen.getByRole('button', { name: '请求撤销' }))
    expect(bridge.gitRestoreFiles).toHaveBeenCalledWith(['src/auth.ts'])
    expect(screen.getByRole('status')).toHaveTextContent('已处理撤销')
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('还原')
  })

  it('auto-allows permissions in observe mode and supports stop slash command', async () => {
    acpMocks.promptBlocks.mockImplementation(() => new Promise(() => undefined))
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(screen.getByRole('button', { name: '切换审批模式' }))
    await user.click(screen.getByRole('menuitemradio', { name: /观察模式/ }))

    let finishPrompt: (() => void) | undefined
    acpMocks.promptBlocks.mockImplementationOnce(() => new Promise((resolve) => {
      finishPrompt = () => resolve({ stopReason: 'end_turn' })
    }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '继续')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({
        kind: 'permission',
        requestId: 33,
        title: '运行测试',
        options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
      })
    })
    expect(acpMocks.respondPermission).toHaveBeenCalledWith(33, {
      outcome: 'selected',
      optionId: 'allow-once',
    })
    expect(screen.getByLabelText('系统消息')).toHaveTextContent('观察模式已自动允许')

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '/stop')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(acpMocks.cancel).toHaveBeenCalled()

    await act(async () => {
      finishPrompt?.()
      await Promise.resolve()
    })
  })

  it('accepts and rejects individual reviewed files and hunks', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [{ path: 'src/auth.ts', additions: 1, deletions: 1, patch: '@@ -1,3 +1,3 @@\n keep\n-old\n+new\n tail' }],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(await screen.findByRole('button', { name: '查看 auth.ts' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    await user.click(screen.getByRole('button', { name: '复制此文件 patch' }))
    expect(writeText).toHaveBeenCalled()
    expect(String(writeText.mock.calls[0][0])).toContain('--- a/')
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('剪贴板')
    await user.click(screen.getByRole('button', { name: '导出此文件 patch' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('patch')
    await user.click(screen.getByRole('button', { name: '文件选项' }))
    await user.click(screen.getByRole('menuitem', { name: '复制全部 patch' }))
    expect(writeText.mock.calls.length).toBeGreaterThanOrEqual(2)
    await user.click(screen.getByRole('button', { name: '文件选项' }))
    await user.click(screen.getByRole('menuitem', { name: '导出全部 patch' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('1 个文件')

    await user.click(screen.getByRole('button', { name: '接受此文件改动' }))
    expect(bridge.gitStageFiles).toHaveBeenCalledWith(['src/auth.ts'])
    expect(screen.getByText('已接受')).toBeInTheDocument()
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('暂存')

    await user.click(screen.getByRole('button', { name: '拒绝此文件改动' }))
    expect(bridge.gitRestoreFile).toHaveBeenCalledWith('src/auth.ts')
    expect(screen.getByText('已拒绝')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '批量应用片段决策' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请先对至少一个片段')
    await user.click(screen.getByRole('button', { name: '拒绝片段 h1' }))
    expect(bridge.readTextFile).toHaveBeenCalledWith('src/auth.ts')
    expect(bridge.writeTextFile).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '接受片段 h1' }))
    await user.click(screen.getByRole('button', { name: '批量应用片段决策' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('批量应用')

    await user.click(screen.getByRole('button', { name: '全部接受片段' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('全部标记为接受')
    await user.click(screen.getByRole('button', { name: '全部拒绝片段' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('全部拒绝')
  })

  it('shows a restored session system message when reconnecting', async () => {
    acpMocks.connect.mockResolvedValueOnce({ sessionId: 'sess_restored', restored: true })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(await screen.findByLabelText('系统消息')).toHaveTextContent('已恢复会话')
  })

  it('manages task session bindings from the sessions panel', async () => {
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '绑定会话任务')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '会话列表' }))
    expect(screen.getByRole('dialog', { name: '会话列表' })).toHaveTextContent('session-42')
    await user.type(screen.getByRole('textbox', { name: '过滤会话列表' }), '绑定会话')
    expect(screen.getByRole('dialog', { name: '会话列表' })).toHaveTextContent('绑定会话任务')
    await user.clear(screen.getByRole('textbox', { name: '过滤会话列表' }))
    await user.type(screen.getByRole('textbox', { name: '过滤会话列表' }), 'no-match-zzz')
    expect(screen.getByRole('dialog', { name: '会话列表' })).toHaveTextContent('没有匹配的会话')
    await user.clear(screen.getByRole('textbox', { name: '过滤会话列表' }))
    await user.click(screen.getByRole('button', { name: '回放' }))
    expect(screen.getByLabelText('回放 绑定会话任务')).toHaveTextContent('绑定会话任务')
    await user.click(screen.getByRole('button', { name: '收起回放' }))
    await user.click(screen.getByRole('button', { name: '清除绑定' }))
    expect(screen.getByRole('dialog', { name: '会话列表' })).toHaveTextContent('未绑定会话')
    await user.click(screen.getByRole('button', { name: '强制新会话' }))
    await user.click(screen.getByRole('button', { name: '关闭面板' }))
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('强制新会话')
  })

  it('toggles auto-reconnect and previews hunk decisions', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [{ path: 'src/auth.ts', additions: 1, deletions: 1, patch: '@@ -1,3 +1,3 @@\n keep\n-old\n+new\n tail' }],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    // First open-to-connect attempt fails; later attempts succeed (retry / toggle).
    acpMocks.connect
      .mockRejectedValueOnce(new Error('网络连接中断'))
      .mockResolvedValue({ sessionId: 'session-42', restored: false })
    localStorage.setItem('grok-forge-workspace', 'C:\\repo')
    localStorage.setItem('grok-forge-auto-reconnect', '1')
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByLabelText('自动重连进度')).toHaveTextContent('自动重连')
    expect(await screen.findByLabelText('重连进度通知')).toHaveTextContent('正在自动重连')
    await user.click(screen.getByRole('button', { name: '关闭重连通知' }))
    expect(screen.queryByLabelText('重连进度通知')).toBeNull()

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.click(screen.getByRole('button', { name: '关闭自动连接' }))
    await user.click(screen.getByRole('button', { name: '开启自动连接' }))
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    // Re-enabling auto-connect (or a background retry) should connect without a manual click.
    expect(await screen.findByRole('button', { name: '断开 Grok' }, { timeout: 3_000 })).toBeInTheDocument()
    expect(screen.getByLabelText('文件决策清单')).toHaveTextContent('决策清单')
    await user.click(await screen.findByRole('button', { name: '查看 auth.ts' }))
    await user.click(screen.getByRole('button', { name: '接受片段 h1' }))
    expect(screen.getByLabelText('决策清单摘要')).toHaveTextContent('接受')
    expect(screen.getByRole('button', { name: '决策 auth.ts' })).toHaveTextContent('片段 1')
    await user.click(screen.getByRole('button', { name: '预览片段决策' }))
    expect(screen.getByLabelText('片段决策预览')).toHaveTextContent('接受')
    expect(screen.getByRole('button', { name: '预览片段决策' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '预览片段决策' }))
    expect(screen.getByRole('button', { name: '预览片段决策' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('changes theme, font size, and preferred model from settings', async () => {
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.click(screen.getByRole('button', { name: '浅色' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: '大' }))
    expect(document.documentElement.dataset.font).toBe('lg')
    await user.click(screen.getByRole('button', { name: '模型' }))
    await user.click(screen.getByRole('option', { name: /Grok 4\.5/ }))
    expect(screen.getByRole('option', { name: /Grok 4\.5/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('button', { name: '关闭面板' }))
    expect(screen.getByLabelText('当前模型')).toHaveTextContent('Grok 4.5')

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(await screen.findByRole('button', { name: '断开 Grok' })).toBeInTheDocument()
    expect(acpMocks.setPreferredModel).toHaveBeenCalledWith('grok-4.5')

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '模型' }))
    await user.click(screen.getByRole('option', { name: /Grok Build/ }))
    expect(await screen.findByLabelText('系统消息')).toHaveTextContent('已切换模型为 Grok Build')
    expect(acpMocks.setSessionModel).toHaveBeenCalledWith('grok-build')
  })

  it('shows task stats and export history in settings', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = Document.prototype.createElement.call(document, tagName)
      if (tagName === 'a') el.click = click
      return el
    })

    render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '统计用任务')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    expect(screen.getByLabelText('任务统计摘要')).toHaveTextContent('共')

    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByLabelText('任务统计')).toHaveTextContent('活跃')
    expect(screen.getByLabelText('统计时段')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '今日' }))
    expect(screen.getByRole('button', { name: '今日' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '导出任务统计 Markdown' }))
    await user.click(screen.getByRole('button', { name: '数据' }))
    expect(screen.getByLabelText('最近导出')).toHaveTextContent('任务统计')
    await user.click(screen.getByRole('button', { name: '清空导出记录' }))
    expect(screen.getByLabelText('最近导出')).toHaveTextContent('暂无导出记录')

    await user.click(screen.getByRole('button', { name: '导出全部任务 JSON' }))
    expect(screen.getByLabelText('最近导出')).toHaveTextContent('任务 JSON')
    expect(screen.getByRole('button', { name: /重新下载/ })).toBeInTheDocument()
    createObjectURL.mockClear()
    click.mockClear()
    await user.click(screen.getByRole('button', { name: /重新下载/ }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '清空导出记录' }))
    expect(screen.getByLabelText('最近导出')).toHaveTextContent('暂无导出记录')
    await user.click(screen.getByRole('button', { name: '关闭面板' }))
    vi.restoreAllMocks()
  })

  it('edits profile card, exports all tasks, and exposes resize handles', async () => {
    const click = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = Document.prototype.createElement.call(document, tagName)
      if (tagName === 'a') el.click = click
      return el
    })

    const user = userEvent.setup()
    const { fireEvent } = await import('@testing-library/react')
    render(<App />)

    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('本地工作区')
    expect(screen.getByLabelText('调整侧边栏宽度')).toBeInTheDocument()
    expect(screen.getByLabelText('调整审阅面板宽度')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('调整侧边栏宽度'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByLabelText('调整审阅面板宽度'), { key: 'ArrowLeft' })

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '资料' }))
    fireEvent.change(screen.getByRole('textbox', { name: '资料显示名称' }), { target: { value: 'Forge Lab' } })
    fireEvent.change(screen.getByRole('textbox', { name: '资料套餐标签' }), { target: { value: 'Pro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '资料额度百分比' }), { target: { value: '42' } })
    await user.click(screen.getByRole('button', { name: '数据' }))
    await user.click(screen.getByRole('button', { name: '导出全部任务 JSON' }))
    await user.click(screen.getByRole('button', { name: '导出全部任务 Markdown' }))
    await user.click(screen.getByRole('button', { name: '重置面板宽度' }))
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('Forge Lab')
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('Pro')
    expect(screen.getByLabelText('42% 本月额度')).toBeInTheDocument()
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('shows live billing usage on the profile card after connect', async () => {
    const periodEnd = new Date(Date.now() + 4 * 24 * 60 * 60_000 + 17 * 60 * 60_000).toISOString()
    acpMocks.fetchBilling.mockResolvedValue({
      usagePercent: 37.4,
      periodType: 'USAGE_PERIOD_TYPE_WEEKLY',
      periodEnd,
      tier: 'SuperGrok',
      prepaidBalanceCents: 1500,
      refreshedAt: Date.now(),
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    expect(await screen.findByRole('button', { name: '断开 Grok' })).toBeInTheDocument()
    expect(acpMocks.fetchBilling).toHaveBeenCalled()

    const profile = await screen.findByLabelText('工作区资料')
    expect(profile).toHaveTextContent('SuperGrok')
    expect(profile).toHaveTextContent('37% 本周额度')
    expect(profile.textContent).toMatch(/4d 1[67]h/)
    expect(profile).toHaveTextContent('实时')
    expect(profile).toHaveTextContent('余额 $15')
    expect(screen.getByLabelText(/37% 本周额度/)).toBeInTheDocument()
    expect(screen.getByLabelText(/额度重置倒计时/).textContent).toMatch(/4d 1[67]h/)
    expect(await screen.findByRole('button', { name: '更新用量数据' })).toHaveTextContent('刚刚更新')
    expect(screen.getByRole('button', { name: '更新用量数据' })).toHaveTextContent('后更新')

    acpMocks.fetchBilling.mockClear()
    acpMocks.fetchBilling.mockResolvedValue({
      usagePercent: 38,
      periodType: 'USAGE_PERIOD_TYPE_WEEKLY',
      periodEnd,
      tier: 'SuperGrok',
      refreshedAt: Date.now(),
    })
    await user.click(screen.getByRole('button', { name: '更新用量数据' }))
    await act(async () => { await Promise.resolve() })
    expect(acpMocks.fetchBilling).toHaveBeenCalled()
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('38% 本周额度')

    // Transient failure / null payload must keep the last good live snapshot.
    acpMocks.fetchBilling.mockClear()
    acpMocks.fetchBilling.mockRejectedValueOnce(new Error('billing timeout'))
    await user.click(screen.getByRole('button', { name: '更新用量数据' }))
    await act(async () => { await Promise.resolve() })
    expect(acpMocks.fetchBilling).toHaveBeenCalled()
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('SuperGrok')
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('38% 本周额度')
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('实时')

    acpMocks.fetchBilling.mockClear()
    acpMocks.fetchBilling.mockResolvedValueOnce(null)
    await user.click(screen.getByRole('button', { name: '更新用量数据' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('38% 本周额度')
    expect(screen.getByLabelText('工作区资料')).toHaveTextContent('实时')
  })

  it('imports tasks, filters commands, and switches split multi-file review', async () => {
    const user = userEvent.setup()
    const { fireEvent } = await import('@testing-library/react')
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [
        { path: 'src/a.ts', additions: 1, deletions: 1, patch: '@@ -1,3 +1,3 @@\n keep\n-old\n+new\n tail' },
        { path: 'src/b.ts', additions: 1, deletions: 0, patch: '@@ -1 +1,2 @@\n keep\n+added' },
      ],
      terminals: [],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(screen.getByRole('button', { name: '并排 diff 视图' }))
    expect(screen.getByLabelText('并排 diff')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '忽略空白差异' }))
    expect(screen.getByRole('button', { name: '忽略空白差异' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '展开全部片段' }))
    expect(screen.getByRole('button', { name: '展开全部片段' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '折叠未改动上下文' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '折叠未改动上下文' }))
    expect(screen.getByRole('button', { name: '折叠未改动上下文' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: '折叠未改动上下文' }))
    await user.click(screen.getByRole('button', { name: '固定对比 a.ts' }))
    await user.click(screen.getByRole('button', { name: '固定对比 b.ts' }))
    expect(screen.getByLabelText('多文件对比')).toHaveTextContent('a.ts')
    expect(screen.getByLabelText('多文件对比')).toHaveTextContent('b.ts')

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '数据' }))
    const payload = JSON.stringify({
      version: 1,
      activeTaskId: 'import-1',
      tasks: [{
        id: 'import-1',
        title: '导入的任务',
        status: 'idle',
        updatedAt: Date.now(),
        messages: [{ role: 'user', content: 'hello import' }],
      }],
    })
    const file = new File([payload], 'tasks.json', { type: 'application/json' })
    const originalReader = globalThis.FileReader
    class MockReader {
      result: string | null = null
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      readAsText() {
        this.result = payload
        queueMicrotask(() => this.onload?.())
      }
    }
    // @ts-expect-error test mock
    globalThis.FileReader = MockReader
    fireEvent.change(screen.getByLabelText('选择任务 JSON 文件'), {
      target: { files: [file] },
    })
    // trigger merge path explicitly via button then change already fired; call merge handler by re-firing with data-mode
    const input = screen.getByLabelText('选择任务 JSON 文件')
    input.setAttribute('data-mode', 'merge')
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByRole('status')).toHaveTextContent(/导入/)
    globalThis.FileReader = originalReader
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    await user.click(screen.getByRole('button', { name: '附加内容' }))
    // when no files selected opens commands
    expect(screen.getByRole('dialog', { name: '命令' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '搜索命令或任务' }), 'stop')
    expect(screen.getByRole('button', { name: /\/stop/ })).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: '搜索命令或任务' }))
    await user.type(screen.getByRole('textbox', { name: '搜索命令或任务' }), '导入')
    const dialog = screen.getByRole('dialog', { name: '命令' })
    expect(within(dialog).getByText('导入的任务')).toBeInTheDocument()
  })

  it('adds task tags, filters by tag, and searches messages globally', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = Document.prototype.createElement.call(document, tagName)
      if (tagName === 'a') el.click = click
      return el
    })

    render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '标签与搜索任务内容')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '任务选项' }))
    await user.click(screen.getByRole('menuitem', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '添加任务标签' }), 'feature')
    await user.click(screen.getByRole('button', { name: '确认添加标签' }))
    expect(screen.getByLabelText('任务标签')).toHaveTextContent('#feature')
    expect(screen.getByLabelText('标签分组')).toHaveTextContent('#feature')
    await user.click(screen.getByRole('button', { name: '筛选标签 feature' }))
    expect(screen.getByRole('button', { name: /切换到任务/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '全部' }))

    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    expect(screen.getByRole('dialog', { name: '全局搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出搜索结果清单' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '复制搜索结果清单' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: '全局搜索输入' }), '标签与搜索')
    expect(screen.getByLabelText('搜索结果')).toHaveTextContent('标签与搜索')
    expect(screen.getByRole('button', { name: '导出搜索结果清单' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '复制搜索结果清单' })).toBeEnabled()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await user.click(screen.getByRole('button', { name: '复制搜索结果清单' }))
    expect(writeText).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('已复制到剪贴板')
    createObjectURL.mockClear()
    click.mockClear()
    await user.click(screen.getByRole('button', { name: '导出搜索结果清单' }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '全局搜索' })
    await user.click(within(dialog).getAllByRole('option', { name: /打开任务|跳转到消息/ })[0])
    expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('pins tasks to the top and jumps search hits to message anchors', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '锚点消息正文甲')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '另一条任务乙')
    await user.click(screen.getByRole('button', { name: '发送任务' }))

    const pinButtons = screen.getAllByRole('button', { name: /置顶/ })
    await user.click(pinButtons[pinButtons.length - 1])
    const taskButtons = screen.getAllByRole('button', { name: /切换到任务/ })
    expect(taskButtons[0].textContent).toMatch(/置顶|另一条|锚点/)

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
    expect(screen.getByRole('button', { name: '取消置顶 另一条任务乙' })).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
    expect(screen.getByRole('button', { name: '置顶 另一条任务乙' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    await user.type(screen.getByRole('textbox', { name: '全局搜索输入' }), '锚点消息')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    // Move to the message hit (title is usually first) so Enter highlights the bubble.
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /跳转到消息/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument()
    const highlighted = document.querySelector('.message-highlight')
    expect(highlighted).toBeTruthy()
    expect(highlighted?.textContent).toMatch(/锚点消息/)
  })

  it('supports task context menu rename and clear', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '右键菜单任务')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '任务菜单 右键菜单任务' }))
    expect(screen.getByRole('menu', { name: '任务右键菜单' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: '重命名' }))
    const rename = screen.getByRole('textbox', { name: '重命名任务 右键菜单任务' })
    await user.clear(rename)
    await user.type(rename, '新任务名')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '切换到任务 新任务名' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '归档候选')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '切换到任务 归档候选' }))
    await user.keyboard('{Control>}{Shift>}a{/Shift}{/Control}')
    expect(screen.queryByRole('button', { name: '切换到任务 归档候选' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '显示已归档任务' }))
    expect(screen.getByRole('button', { name: '切换到任务 归档候选' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '任务菜单 归档候选' }))
    await user.click(screen.getByRole('menuitem', { name: '取消归档' }))
    // No archived tasks remain, so the archive toggle disappears and the task stays visible.
    expect(screen.queryByRole('button', { name: /显示已归档任务|隐藏已归档任务/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换到任务 归档候选' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '任务菜单 新任务名' }))
    await user.click(screen.getByRole('menuitem', { name: '清空对话' }))
    expect(screen.queryByText('右键菜单任务')).not.toBeInTheDocument()
  })

  it('accepts drag-and-drop attachments on the composer', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<App />)
    const form = screen.getByLabelText('任务输入区')
    const file = new File(['drop-body'], 'drop.txt', { type: 'text/plain' })
    fireEvent.dragOver(form, { dataTransfer: { types: ['Files'], files: [file], dropEffect: 'copy' } })
    expect(screen.getByRole('status')).toHaveTextContent('松开以附加')
    fireEvent.drop(form, { dataTransfer: { types: ['Files'], files: [file] } })
    expect(await screen.findByLabelText('附件列表')).toHaveTextContent('drop.txt')
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('拖入')
  })

  it('pastes images, toggles notifications, and records shortcuts', async () => {
    const user = userEvent.setup()
    const { fireEvent } = await import('@testing-library/react')
    render(<App />)

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'clip.png', { type: 'image/png' })
    const input = screen.getByRole('textbox', { name: '任务输入' })
    const originalReader = globalThis.FileReader
    class MockReader {
      result: string | null = null
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      readAsDataURL() {
        this.result = 'data:image/png;base64,qq'
        queueMicrotask(() => this.onload?.())
      }
    }
    // @ts-expect-error test mock
    globalThis.FileReader = MockReader
    fireEvent.paste(input, {
      clipboardData: {
        items: [{
          kind: 'file',
          type: 'image/png',
          getAsFile: () => file,
        }],
      },
    })
    expect(await screen.findByLabelText('附件列表')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /粘贴图片/ })).toBeInTheDocument()
    expect(screen.getAllByLabelText('系统消息').at(-1)).toHaveTextContent('剪贴板')
    globalThis.FileReader = originalReader

    // Sending keeps a visible image in the conversation bubble.
    fireEvent.keyDown(input, { key: 'Enter', bubbles: true })
    expect(await screen.findByLabelText('消息附件')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /粘贴图片/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.click(screen.getByRole('button', { name: '关闭桌面通知' }))
    expect(screen.getByRole('button', { name: '关闭桌面通知' })).toHaveClass('active')
    await user.click(screen.getByRole('button', { name: '快捷键' }))
    await user.click(screen.getByRole('button', { name: '录制快捷键 新建任务' }))
    expect(screen.getByRole('button', { name: '录制快捷键 新建任务' })).toHaveTextContent('按下按键')
    fireEvent.keyDown(window, { key: 'm', ctrlKey: true, bubbles: true })
    expect(screen.getByText('Ctrl+M')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument()
  })

  it('exports session replay markdown from the sessions panel', async () => {
    const click = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = Document.prototype.createElement.call(document, tagName)
      if (tagName === 'a') {
        el.click = click
      }
      return el
    })

    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '导出 Markdown 任务')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    await user.click(screen.getByRole('button', { name: '会话列表' }))
    await user.click(screen.getByRole('button', { name: /下载 Markdown/ }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()

    createObjectURL.mockClear()
    click.mockClear()
    await user.click(screen.getByRole('button', { name: '批量导出会话回放' }))
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('configures MCP servers and switches terminal tabs', async () => {
    acpMocks.loadWorkspaceData.mockResolvedValue({
      branch: 'main',
      files: [],
      terminals: [
        { terminalId: 't1', status: 'running', name: 'npm test', output: 'pass', truncated: false },
        { terminalId: 't2', status: 'exited', name: 'build', output: 'done', truncated: true, exitCode: 0 },
      ],
      gitAvailable: true,
      terminalAvailable: true,
    })
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'C:\\repo',
    })
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: 'MCP' }))
    await user.click(screen.getByRole('button', { name: '添加' }))
    await user.type(screen.getByRole('textbox', { name: 'MCP 名称 1' }), 'filesystem')
    await user.type(screen.getByRole('textbox', { name: 'MCP 命令 1' }), 'npx')
    await user.type(screen.getByRole('textbox', { name: 'MCP 参数 1' }), '-y server')
    await user.click(screen.getByRole('button', { name: '关闭面板' }))

    vi.mocked(bridge.terminalList).mockResolvedValue([
      {
        terminalId: 'local-1',
        name: 'echo hi',
        status: 'running',
        output: 'local-out',
        truncated: false,
        interactive: true,
      },
    ])
    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.click(screen.getByRole('tab', { name: /终端/ }))
    expect(screen.getByRole('tab', { name: 'npm test' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'build' }))
    expect(screen.getByText('done')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /本地 · echo hi/ }))
    expect(screen.getByText('local-out')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: '终端输入' })
    expect(input).not.toBeDisabled()
    await user.type(input, 'dir')
    await user.click(screen.getByRole('button', { name: '发送到终端' }))
    expect(bridge.terminalWrite).toHaveBeenCalledWith('local-1', 'dir')

    vi.mocked(bridge.terminalOpenShell).mockResolvedValueOnce('shell-2')
    vi.mocked(bridge.terminalList).mockResolvedValue([
      {
        terminalId: 'shell-2',
        name: 'powershell.exe -NoLogo',
        status: 'running',
        output: '$ shell\n',
        truncated: false,
        interactive: true,
      },
    ])
    await user.click(screen.getByRole('button', { name: '新建本地 Shell' }))
    expect(bridge.terminalOpenShell).toHaveBeenCalled()
    expect(await screen.findByText('$ shell')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '终止本地终端' }))
    expect(bridge.terminalKill).toHaveBeenCalledWith('shell-2')
    await user.click(screen.getByRole('button', { name: '刷新终端' }))
  })

  it('rejects a permission request and remembers recent workspaces', async () => {
    localStorage.setItem('grok-forge-workspaces', JSON.stringify(['D:\\alpha', 'D:\\beta']))
    localStorage.setItem('grok-forge-workspace', 'D:\\alpha')
    acpMocks.promptBlocks.mockImplementation(() => new Promise(() => undefined))
    vi.mocked(bridge.getBackendStatus).mockResolvedValue({
      mode: 'native', installed: true, version: 'grok 1.0.0', workspacePath: 'D:\\alpha',
    })
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('button', { name: '切换工作区 beta' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '切换工作区 beta' }))
    expect(screen.getAllByText('D:\\beta').length).toBeGreaterThan(0)

    await user.click(await screen.findByRole('button', { name: '连接 Grok' }))
    await user.type(screen.getByRole('textbox', { name: '任务输入' }), '需要审批')
    await user.click(screen.getByRole('button', { name: '发送任务' }))
    const receive = acpMocks.onEvent.mock.calls.at(-1)?.[0]
    act(() => {
      receive({
        kind: 'permission',
        requestId: 44,
        title: '危险操作',
        options: [
          { optionId: 'allow-once', name: '允许一次', kind: 'allow_once' },
          { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' },
        ],
      })
    })
    await user.click(screen.getByRole('button', { name: '拒绝' }))
    expect(acpMocks.respondPermission).toHaveBeenCalledWith(44, {
      outcome: 'selected',
      optionId: 'reject-once',
    })
    expect(screen.getByLabelText('系统消息')).toHaveTextContent('已拒绝')
  })
})
