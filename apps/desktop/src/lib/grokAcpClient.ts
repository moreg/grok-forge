import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  gitWorkspaceStatus,
  normalizeAcpEvent,
  parsePermissionRequest,
  readTextFile,
  sendGrokRpc,
  setWorkspace,
  startGrok,
  stopGrok,
  terminalCreate,
  terminalKill,
  terminalList,
  terminalOutput,
  terminalRelease,
  terminalWaitForExit,
  writeTextFile,
  listenForRawGrokEvents,
  type AcpUiEvent,
  type LocalTerminal,
} from './desktopBridge'
import { type McpServerConfig, toSessionMcpServers } from './mcp'

type JsonRpcId = number
type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout> | null
}

export type LiveGitFile = {
  path: string
  oldPath?: string
  type?: string
  additions: number
  deletions: number
  patch?: string
}

export type LiveTerminal = {
  terminalId: string
  status: string
  name?: string
  exitCode?: number
  output: string
  truncated: boolean
}

export type GitDataSource = 'acp' | 'local' | 'none'

export type WorkspaceData = {
  branch?: string
  files: LiveGitFile[]
  terminals: LiveTerminal[]
  gitAvailable: boolean
  terminalAvailable: boolean
  /** Where Live Diff data came from (ACP extension vs local git fallback). */
  gitSource?: GitDataSource
}

export type SetModelResult = {
  /** True when the live ACP session accepted session/setModel. */
  applied: boolean
  /** How the preference was recorded. */
  mode: 'session' | 'pending' | 'stored'
  message: string
}

/** Live Grok Build coding-credit usage from `x.ai/billing`. */
export type BillingUsage = {
  /** Included allowance used this period, 0–100. */
  usagePercent: number
  /** Proto period type, e.g. USAGE_PERIOD_TYPE_WEEKLY. */
  periodType?: string
  /** RFC3339 period end when known. */
  periodEnd?: string
  /** Subscription tier display name when present. */
  tier?: string
  /** Prepaid (bought) balance in USD cents, absolute. */
  prepaidBalanceCents?: number
  /** Local wall-clock ms when this snapshot was fetched. */
  refreshedAt?: number
}

/** How often the desktop shell re-polls `_x.ai/billing` while connected. */
export const BILLING_POLL_INTERVAL_MS = 120_000


export type AgentRuntimeCapabilities = {
  loadSession: boolean
  imagePrompt: boolean
  /** null until first setModel attempt (or known unsupported). */
  setModel: boolean | null
  gitExtension: boolean | null
  terminalExtension: boolean | null
}

export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } }

export interface GrokTransport {
  start(cwd: string): Promise<unknown>
  send(payload: unknown): Promise<unknown>
  listen(listener: (payload: unknown) => void): Promise<UnlistenFn>
  stop(): Promise<unknown>
}

export class NativeGrokTransport implements GrokTransport {
  start(cwd: string) { return startGrok(cwd) }
  send(payload: unknown) { return sendGrokRpc(payload) }
  listen(listener: (payload: unknown) => void) { return listenForRawGrokEvents(listener) }
  stop() { return stopGrok() }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function data(value: unknown): Record<string, unknown> {
  const result = object(value)
  return object(result?.data) ?? result ?? {}
}

function number(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * ACP extension methods must be sent with a leading `_` on the wire.
 * Bare `x.ai/...` methods are rejected with method_not_found by agent-client-protocol.
 */
export function toExtMethod(method: string) {
  const trimmed = method.trim()
  if (!trimmed) return trimmed
  return trimmed.startsWith('_') ? trimmed : `_${trimmed}`
}

function centValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const row = object(value)
  if (!row) return undefined
  return optionalNumber(row.val)
}

/** Parse `x.ai/billing` ExtResponse into UI-facing usage. */
export function parseBillingUsage(payload: unknown): BillingUsage | null {
  const root = object(payload)
  if (!root) return null
  // Some wrappers nest under result/data; prefer the first object that has config/usage fields.
  const candidate = object(root.result)
    ?? object(root.data)
    ?? root
  const config = object(candidate.config) ?? (
    optionalNumber(candidate.creditUsagePercent) !== undefined
      || optionalNumber(candidate.credit_usage_percent) !== undefined
      || object(candidate.monthly_limit)
      || object(candidate.monthlyLimit)
      ? candidate
      : null
  )
  if (!config && !optionalString(candidate.subscription_tier) && !optionalString(candidate.subscriptionTier)) {
    return null
  }

  const cfg = config ?? {}
  const creditPct = optionalNumber(cfg.creditUsagePercent)
    ?? optionalNumber(cfg.credit_usage_percent)
  const monthlyLimit = centValue(cfg.monthlyLimit ?? cfg.monthly_limit)
  const used = centValue(cfg.used)
  let usagePercent = 0
  if (creditPct !== undefined) {
    usagePercent = Math.min(100, Math.max(0, creditPct))
  } else if (monthlyLimit && monthlyLimit > 0 && used !== undefined) {
    usagePercent = Math.min(100, Math.max(0, (used / monthlyLimit) * 100))
  } else {
    // Still useful if only tier is present — show 0% rather than hiding the card.
    usagePercent = 0
  }

  const period = object(cfg.currentPeriod) ?? object(cfg.current_period)
  const periodType = optionalString(period?.type)
    ?? optionalString(period?.period_type)
    ?? optionalString(period?.periodType)
  const periodEnd = optionalString(period?.end)
    ?? optionalString(period?.endTime)
    ?? optionalString(period?.end_time)
    ?? optionalString(period?.endsAt)
    ?? optionalString(period?.ends_at)
    ?? optionalString(cfg.billingPeriodEnd)
    ?? optionalString(cfg.billing_period_end)
    ?? optionalString(cfg.periodEnd)
    ?? optionalString(cfg.period_end)
  const prepaid = centValue(cfg.prepaidBalance ?? cfg.prepaid_balance)
  const tier = optionalString(candidate.subscription_tier)
    ?? optionalString(candidate.subscriptionTier)
    ?? optionalString(cfg.subscription_tier)
    ?? optionalString(cfg.subscriptionTier)

  return {
    usagePercent,
    periodType,
    periodEnd,
    tier,
    prepaidBalanceCents: prepaid !== undefined ? Math.abs(prepaid) : undefined,
  }
}

export class GrokAcpClient {
  private nextId = 1
  private sessionId: string | null = null
  private sessionByKey = new Map<string, string>()
  private pending = new Map<JsonRpcId, PendingRequest>()
  private openPermissions = new Set<number>()
  private subscribers = new Set<(event: AcpUiEvent) => void>()
  private unlisten: UnlistenFn | null = null
  private cwd = ''
  private mcpServers: McpServerConfig[] = []
  private supportsLoadSession = false
  private supportsImagePrompt = false
  private supportsSetModel: boolean | null = null
  private gitExtension: boolean | null = null
  private terminalExtension: boolean | null = null
  private modelId: string | null = null

  constructor(
    private readonly transport: GrokTransport = new NativeGrokTransport(),
    private readonly timeoutMs = 20_000,
  ) {}

  setMcpServers(servers: McpServerConfig[]) {
    this.mcpServers = servers
  }

  setPreferredModel(modelId: string | null | undefined) {
    const next = modelId?.trim()
    this.modelId = next ? next : null
  }

  get preferredModel() {
    return this.modelId
  }

  private sessionMeta() {
    return this.modelId ? { modelId: this.modelId } : undefined
  }

  get activeSessionId() {
    return this.sessionId
  }

  get canLoadSession() {
    return this.supportsLoadSession
  }

  get capabilities(): AgentRuntimeCapabilities {
    return {
      loadSession: this.supportsLoadSession,
      imagePrompt: this.supportsImagePrompt,
      setModel: this.supportsSetModel,
      gitExtension: this.gitExtension,
      terminalExtension: this.terminalExtension,
    }
  }

  get supportsImages() {
    return this.supportsImagePrompt
  }

  onEvent(subscriber: (event: AcpUiEvent) => void) {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  async connect(
    cwd: string,
    sessionKey = 'default',
    mcpServers: McpServerConfig[] = this.mcpServers,
    preferredSessionId?: string,
  ) {
    this.cwd = cwd
    this.mcpServers = mcpServers
    if (!this.unlisten) {
      this.unlisten = await this.transport.listen((payload) => this.handlePayload(payload))
    }
    await this.transport.start(cwd)
    if (this.transport instanceof NativeGrokTransport || isNativeBridgeAvailable()) {
      await setWorkspace(cwd).catch(() => undefined)
    }
    const init = await this.request<{
      protocolVersion?: number
      agentCapabilities?: {
        loadSession?: boolean
        promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }
      }
    }>('initialize', {
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
    this.supportsLoadSession = init?.agentCapabilities?.loadSession === true
    this.supportsImagePrompt = init?.agentCapabilities?.promptCapabilities?.image === true
    return this.ensureSession(sessionKey, cwd, preferredSessionId)
  }

  async ensureSession(sessionKey: string, cwd = this.cwd, preferredSessionId?: string) {
    const existing = this.sessionByKey.get(sessionKey)
    if (existing) {
      this.sessionId = existing
      return { sessionId: existing, restored: false }
    }

    if (preferredSessionId && this.supportsLoadSession) {
      try {
        const meta = this.sessionMeta()
        await this.request('session/load', {
          sessionId: preferredSessionId,
          cwd: cwd || this.cwd,
          mcpServers: toSessionMcpServers(this.mcpServers),
          ...(meta ? { _meta: meta } : {}),
        }, 60_000)
        this.sessionByKey.set(sessionKey, preferredSessionId)
        this.sessionId = preferredSessionId
        if (this.modelId) {
          await this.setSessionModel(this.modelId).catch(() => undefined)
        }
        return { sessionId: preferredSessionId, restored: true }
      } catch {
        // Fall through to create a fresh session.
      }
    }

    const meta = this.sessionMeta()
    const session = await this.request<{ sessionId: string }>('session/new', {
      cwd: cwd || this.cwd,
      mcpServers: toSessionMcpServers(this.mcpServers),
      ...(meta ? { _meta: meta } : {}),
    })
    if (!session.sessionId) throw new Error('Grok 未返回会话 ID')
    this.sessionByKey.set(sessionKey, session.sessionId)
    this.sessionId = session.sessionId
    return { sessionId: session.sessionId, restored: false }
  }

  /**
   * Prefer live session/setModel; if the runtime lacks it, keep the preference for
   * the next session/new (_meta.modelId) instead of treating it as a hard failure.
   */
  async setSessionModel(modelId: string): Promise<SetModelResult> {
    const next = modelId.trim()
    this.modelId = next || null
    if (!next) {
      return { applied: false, mode: 'stored', message: '已清除模型偏好' }
    }
    if (!this.sessionId) {
      return {
        applied: false,
        mode: 'stored',
        message: `已记住模型偏好，连接后将通过 _meta.modelId 注入`,
      }
    }
    if (this.supportsSetModel === false) {
      return {
        applied: false,
        mode: 'pending',
        message: `当前运行时不支持 session/setModel，已记住偏好，下次新建会话时生效`,
      }
    }
    try {
      await this.request('session/setModel', {
        sessionId: this.sessionId,
        modelId: next,
      })
      this.supportsSetModel = true
      return { applied: true, mode: 'session', message: '已切换当前会话模型' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/method not found/i.test(message) || /unsupported method/i.test(message)) {
        this.supportsSetModel = false
        return {
          applied: false,
          mode: 'pending',
          message: `当前运行时不支持 session/setModel，已记住偏好，下次新建会话时生效`,
        }
      }
      throw error
    }
  }

  async listLocalTerminals(): Promise<LocalTerminal[]> {
    try {
      return await terminalList()
    } catch {
      return []
    }
  }

  prompt(text: string, options?: { sessionKey?: string; blocks?: PromptBlock[] }) {
    if (!this.sessionId && this.sessionByKey.size === 0) {
      return Promise.reject(new Error('Grok 会话尚未建立'))
    }
    const blocks = options?.blocks?.length
      ? options.blocks
      : [{ type: 'text' as const, text }]
    return this.promptBlocks(blocks, options?.sessionKey)
  }

  async promptBlocks(blocks: PromptBlock[], sessionKey = 'default') {
    if (!this.sessionId && this.sessionByKey.size === 0) {
      return Promise.reject(new Error('Grok 会话尚未建立'))
    }
    await this.ensureSession(sessionKey)
    if (!this.sessionId) return Promise.reject(new Error('Grok 会话尚未建立'))
    return this.request('session/prompt', {
      sessionId: this.sessionId,
      prompt: blocks,
    }, 30 * 60 * 1_000)
  }

  async cancel() {
    if (!this.sessionId) return
    for (const requestId of [...this.openPermissions]) {
      await this.respondPermission(requestId, { outcome: 'cancelled' }).catch(() => undefined)
    }
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: this.sessionId },
    })
  }

  async respondPermission(
    requestId: number,
    outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' },
  ) {
    this.openPermissions.delete(requestId)
    await this.transport.send({
      jsonrpc: '2.0',
      id: requestId,
      result: { outcome },
    })
  }

  private async loadLocalGitFallback(): Promise<{
    branch?: string
    files: LiveGitFile[]
    available: boolean
  }> {
    try {
      const local = await gitWorkspaceStatus()
      if (!local.available) {
        return { branch: local.branch, files: [], available: false }
      }
      return {
        branch: local.branch,
        files: local.files.map((file) => ({
          path: file.path,
          oldPath: file.oldPath,
          type: file.type,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        })),
        available: true,
      }
    } catch {
      return { files: [], available: false }
    }
  }

  /**
   * Fetch live Grok Build coding-credit usage via `_x.ai/billing`.
   * Returns null when unauthenticated, unsupported, or the request fails.
   */
  async fetchBilling(): Promise<BillingUsage | null> {
    try {
      const result = await this.extRequest('x.ai/billing', {}, 15_000)
      const usage = parseBillingUsage(result)
      if (!usage) return null
      return { ...usage, refreshedAt: Date.now() }
    } catch {
      return null
    }
  }

  async loadWorkspaceData(): Promise<WorkspaceData> {
    if (!this.sessionId) throw new Error('Grok 会话尚未建立')
    const sessionId = this.sessionId
    const [statusResponse, diffsResponse, terminalsResponse] = await Promise.all([
      this.extRequest('x.ai/git/status', { sessionId, includeUntracked: true, includeStats: true }).catch(() => null),
      this.extRequest('x.ai/git/diffs', { sessionId, from: 'HEAD', to: 'working', includePatch: true }).catch(() => null),
      this.extRequest('x.ai/terminal/list', { sessionId }).catch(() => null),
    ])
    const acpGitReady = statusResponse !== null && diffsResponse !== null
    this.gitExtension = acpGitReady
    this.terminalExtension = terminalsResponse !== null

    const status = data(statusResponse)
    const diffs = data(diffsResponse)
    const terminalList = data(terminalsResponse)
    const rawFiles = Array.isArray(diffs.files) ? diffs.files : [
      ...(Array.isArray(status.staged) ? status.staged : []),
      ...(Array.isArray(status.unstaged) ? status.unstaged : []),
    ]
    let files = rawFiles.flatMap((value): LiveGitFile[] => {
      const file = object(value)
      if (!file || typeof file.path !== 'string') return []
      return [{
        path: file.path,
        oldPath: typeof file.oldPath === 'string' ? file.oldPath : undefined,
        type: typeof file.type === 'string' ? file.type : undefined,
        additions: number(file.additions),
        deletions: number(file.deletions),
        patch: typeof file.patch === 'string' ? file.patch : undefined,
      }]
    })
    let branch = typeof status.branch === 'string' ? status.branch : undefined
    let gitSource: GitDataSource = acpGitReady ? 'acp' : 'none'
    let gitAvailable = acpGitReady

    if (!acpGitReady) {
      const local = await this.loadLocalGitFallback()
      if (local.available) {
        branch = local.branch ?? branch
        files = local.files
        gitAvailable = true
        gitSource = 'local'
      }
    }

    const terminalEntries = Array.isArray(terminalList.terminals) ? terminalList.terminals : []
    const terminals = await Promise.all(terminalEntries.flatMap(async (value): Promise<LiveTerminal[]> => {
      const terminal = object(value)
      if (!terminal || typeof terminal.terminalId !== 'string') return []
      const output = data(await this.extRequest('x.ai/terminal/output', { sessionId, terminalId: terminal.terminalId }).catch(() => ({})))
      return [{
        terminalId: terminal.terminalId,
        status: typeof terminal.status === 'string' ? terminal.status : 'unknown',
        name: typeof terminal.name === 'string' ? terminal.name : undefined,
        exitCode: typeof terminal.exitCode === 'number' ? terminal.exitCode : undefined,
        output: typeof output.output === 'string' ? output.output : '',
        truncated: output.truncated === true,
      }]
    }))
    return {
      branch,
      files,
      terminals: terminals.flat(),
      gitAvailable,
      terminalAvailable: terminalsResponse !== null,
      gitSource,
    }
  }

  async disconnect() {
    for (const requestId of [...this.openPermissions]) {
      await this.respondPermission(requestId, { outcome: 'cancelled' }).catch(() => undefined)
    }
    this.sessionId = null
    this.sessionByKey.clear()
    this.unlisten?.()
    this.unlisten = null
    for (const pending of this.pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout)
      pending.reject(new Error('Grok 会话已关闭'))
    }
    this.pending.clear()
    await this.transport.stop()
  }

  private request<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs > 0
        ? setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`Grok 请求超时：${method}`))
        }, timeoutMs)
        : null
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })
      void this.transport.send({ jsonrpc: '2.0', id, method, params }).catch((reason) => {
        if (timeout) clearTimeout(timeout)
        this.pending.delete(id)
        reject(reason instanceof Error ? reason : new Error(String(reason)))
      })
    })
  }

  /** JSON-RPC call for ACP agent extension methods (`_x.ai/...` on the wire). */
  private extRequest<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    return this.request<T>(toExtMethod(method), params, timeoutMs)
  }

  private emit(event: AcpUiEvent) {
    this.subscribers.forEach((subscriber) => subscriber(event))
  }

  private handlePayload(payload: unknown) {
    const message = object(payload)
    if (!message) return

    // Responses to our outbound requests take priority when we still await that id.
    if (typeof message.id === 'number' && this.pending.has(message.id) && message.method === undefined) {
      const pending = this.pending.get(message.id)
      if (pending) {
        if (pending.timeout) clearTimeout(pending.timeout)
        this.pending.delete(message.id)
        const error = object(message.error)
        if (error) {
          pending.reject(new Error(typeof error.message === 'string' ? error.message : 'Grok ACP 请求失败'))
        } else {
          pending.resolve(message.result)
        }
        return
      }
    }

    // Incoming requests from the agent
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      const permission = parsePermissionRequest(message)
      if (permission && permission.kind === 'permission') {
        this.openPermissions.add(permission.requestId)
        this.emit(permission)
        return
      }
      void this.handleAgentRequest(message.id, message.method, object(message.params) ?? {})
      return
    }

    const event = normalizeAcpEvent(message)
    if (event) this.emit(event)
  }

  private async handleAgentRequest(id: number, method: string, params: Record<string, unknown>) {
    try {
      if (method === 'fs/read_text_file') {
        const path = typeof params.path === 'string' ? params.path : ''
        if (!path) throw new Error('缺少 path')
        const content = await readTextFile(path, {
          line: typeof params.line === 'number' ? params.line : undefined,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
        })
        await this.transport.send({ jsonrpc: '2.0', id, result: { content } })
        this.emit({ kind: 'tool', title: `读取 ${path}`, status: 'completed', detail: path, toolKind: 'read' })
        return
      }
      if (method === 'fs/write_text_file') {
        const path = typeof params.path === 'string' ? params.path : ''
        const content = typeof params.content === 'string' ? params.content : ''
        if (!path) throw new Error('缺少 path')
        await writeTextFile(path, content)
        await this.transport.send({ jsonrpc: '2.0', id, result: null })
        this.emit({ kind: 'tool', title: `写入 ${path}`, status: 'completed', detail: path, toolKind: 'edit' })
        this.emit({ kind: 'workspace' })
        return
      }
      if (method === 'terminal/create') {
        const command = typeof params.command === 'string' ? params.command : ''
        if (!command) throw new Error('缺少 command')
        const args = Array.isArray(params.args)
          ? params.args.filter((item): item is string => typeof item === 'string')
          : []
        const env = Array.isArray(params.env)
          ? params.env.flatMap((item) => {
            const row = object(item)
            if (!row || typeof row.name !== 'string' || typeof row.value !== 'string') return []
            return [{ name: row.name, value: row.value }]
          })
          : undefined
        const terminalId = await terminalCreate({
          command,
          args,
          cwd: typeof params.cwd === 'string' ? params.cwd : this.cwd || undefined,
          env,
          outputByteLimit: typeof params.outputByteLimit === 'number' ? params.outputByteLimit : undefined,
        })
        await this.transport.send({ jsonrpc: '2.0', id, result: { terminalId } })
        this.emit({
          kind: 'tool',
          title: `终端 ${command}`,
          status: 'in_progress',
          detail: args.length ? `${command} ${args.join(' ')}` : command,
          toolKind: 'execute',
          toolCallId: terminalId,
        })
        return
      }
      if (method === 'terminal/output') {
        const terminalId = typeof params.terminalId === 'string' ? params.terminalId : ''
        if (!terminalId) throw new Error('缺少 terminalId')
        const result = await terminalOutput(terminalId)
        await this.transport.send({
          jsonrpc: '2.0',
          id,
          result: {
            output: result.output,
            truncated: result.truncated,
            exitStatus: result.exitStatus ?? null,
          },
        })
        return
      }
      if (method === 'terminal/wait_for_exit') {
        const terminalId = typeof params.terminalId === 'string' ? params.terminalId : ''
        if (!terminalId) throw new Error('缺少 terminalId')
        const result = await terminalWaitForExit(terminalId)
        await this.transport.send({ jsonrpc: '2.0', id, result })
        this.emit({ kind: 'tool', title: `终端结束 ${terminalId}`, status: 'completed', toolKind: 'execute', toolCallId: terminalId })
        return
      }
      if (method === 'terminal/kill') {
        const terminalId = typeof params.terminalId === 'string' ? params.terminalId : ''
        if (!terminalId) throw new Error('缺少 terminalId')
        await terminalKill(terminalId)
        await this.transport.send({ jsonrpc: '2.0', id, result: null })
        this.emit({ kind: 'tool', title: `终止终端 ${terminalId}`, status: 'completed', toolKind: 'execute', toolCallId: terminalId })
        return
      }
      if (method === 'terminal/release') {
        const terminalId = typeof params.terminalId === 'string' ? params.terminalId : ''
        if (!terminalId) throw new Error('缺少 terminalId')
        await terminalRelease(terminalId)
        await this.transport.send({ jsonrpc: '2.0', id, result: null })
        return
      }
      await this.transport.send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unsupported method: ${method}` },
      })
    } catch (error) {
      await this.transport.send({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => undefined)
    }
  }
}

function isNativeBridgeAvailable() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
