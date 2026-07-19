import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'

export type BackendStatus = {
  mode: 'preview' | 'native'
  installed: boolean
  version: string
  path?: string
  workspacePath?: string
}

export type GrokProcessStatus = {
  running: boolean
  pid?: number
}

export type PermissionOption = {
  optionId: string
  name: string
  kind: string
}

export type AcpUiEvent =
  | {
      kind: 'tool'
      toolCallId?: string
      title: string
      status: string
      toolKind?: string
      detail?: string
      paths?: string[]
    }
  | { kind: 'message'; text: string }
  | { kind: 'thought'; text: string }
  | { kind: 'plan'; entries: unknown[] }
  | {
      kind: 'permission'
      requestId: number
      toolCallId?: string
      title: string
      options: PermissionOption[]
    }
  | { kind: 'workspace' }

export type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

const invoke = tauriInvoke as InvokeFn

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getBackendStatus(
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<BackendStatus> {
  if (!native) {
    return { mode: 'preview', installed: true, version: 'Browser preview' }
  }

  return invokeFn<BackendStatus>('grok_status')
}

export function startGrok(cwd: string, invokeFn: InvokeFn = invoke) {
  return invokeFn<GrokProcessStatus>('start_grok', { cwd })
}

export function stopGrok(invokeFn: InvokeFn = invoke) {
  return invokeFn<GrokProcessStatus>('stop_grok')
}

export function sendGrokRpc(payload: unknown, invokeFn: InvokeFn = invoke) {
  return invokeFn<void>('send_grok_rpc', { payload })
}

export function setWorkspace(cwd: string, invokeFn: InvokeFn = invoke) {
  return invokeFn<void>('set_workspace', { cwd })
}

export async function readTextFile(
  path: string,
  options?: { line?: number; limit?: number },
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<string> {
  if (!native) throw new Error('浏览器预览模式不支持本地文件读取')
  const result = await invokeFn<{ content: string }>('read_text_file', {
    path,
    line: options?.line,
    limit: options?.limit,
  })
  return result.content
}

export async function writeTextFile(
  path: string,
  content: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<void> {
  if (!native) throw new Error('浏览器预览模式不支持本地文件写入')
  await invokeFn<void>('write_text_file', { path, content })
}

export async function gitRestoreFile(
  path: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<void> {
  if (!native) throw new Error('浏览器预览模式不支持 git 还原')
  await invokeFn<void>('git_restore_file', { path })
}

export type GitPathResult = {
  path: string
  ok: boolean
  error?: string
}

export type GitBatchResult = {
  results: GitPathResult[]
  succeeded: number
  failed: number
}

function normalizeGitBatch(result: GitBatchResult): GitBatchResult {
  const results = Array.isArray(result.results)
    ? result.results.flatMap((row): GitPathResult[] => {
      if (!row || typeof row.path !== 'string') return []
      return [{
        path: row.path,
        ok: row.ok === true,
        error: typeof row.error === 'string' ? row.error : undefined,
      }]
    })
    : []
  return {
    results,
    succeeded: typeof result.succeeded === 'number' ? result.succeeded : results.filter((r) => r.ok).length,
    failed: typeof result.failed === 'number' ? result.failed : results.filter((r) => !r.ok).length,
  }
}

/** Restore one or more workspace paths to HEAD (tracked) or delete untracked files. */
export async function gitRestoreFiles(
  paths: string[],
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<GitBatchResult> {
  if (!native) throw new Error('浏览器预览模式不支持 git 还原')
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (unique.length === 0) return { results: [], succeeded: 0, failed: 0 }
  const result = await invokeFn<GitBatchResult>('git_restore_files', { paths: unique })
  return normalizeGitBatch(result)
}

/** Stage (git add) one or more workspace paths. */
export async function gitStageFiles(
  paths: string[],
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<GitBatchResult> {
  if (!native) throw new Error('浏览器预览模式不支持 git 暂存')
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (unique.length === 0) return { results: [], succeeded: 0, failed: 0 }
  const result = await invokeFn<GitBatchResult>('git_stage_files', { paths: unique })
  return normalizeGitBatch(result)
}

export type LocalGitFile = {
  path: string
  oldPath?: string
  type?: string
  additions: number
  deletions: number
  patch?: string
}

export type LocalGitStatus = {
  branch?: string
  files: LocalGitFile[]
  available: boolean
}

/** Local git status/diff fallback when the Grok runtime lacks x.ai/git/* extensions. */
export async function gitWorkspaceStatus(
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<LocalGitStatus> {
  if (!native) throw new Error('浏览器预览模式不支持本地 git')
  const result = await invokeFn<LocalGitStatus>('git_workspace_status')
  return {
    branch: typeof result.branch === 'string' ? result.branch : undefined,
    files: Array.isArray(result.files)
      ? result.files.flatMap((file): LocalGitFile[] => {
        if (!file || typeof file.path !== 'string') return []
        return [{
          path: file.path,
          oldPath: typeof file.oldPath === 'string' ? file.oldPath : undefined,
          type: typeof file.type === 'string' ? file.type : undefined,
          additions: typeof file.additions === 'number' ? file.additions : 0,
          deletions: typeof file.deletions === 'number' ? file.deletions : 0,
          patch: typeof file.patch === 'string' ? file.patch : undefined,
        }]
      })
      : [],
    available: result.available === true,
  }
}

export type TerminalCreateParams = {
  command: string
  args?: string[]
  cwd?: string
  env?: Array<{ name: string; value: string }>
  outputByteLimit?: number
  /** When true, stdin is piped so the UI can send input. */
  interactive?: boolean
}

export type TerminalOutputResult = {
  output: string
  truncated: boolean
  exitStatus?: { exitCode?: number | null; signal?: string | null } | null
}

export async function terminalCreate(
  params: TerminalCreateParams,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<string> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  const result = await invokeFn<{ terminalId: string }>('terminal_create', {
    command: params.command,
    args: params.args ?? [],
    cwd: params.cwd,
    env: params.env,
    outputByteLimit: params.outputByteLimit,
    interactive: params.interactive ?? false,
  })
  return result.terminalId
}

/** Open a local interactive shell (PowerShell on Windows, $SHELL elsewhere). */
export async function terminalOpenShell(
  cwd?: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<string> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  const result = await invokeFn<{ terminalId: string }>('terminal_open_shell', {
    cwd: cwd || undefined,
  })
  return result.terminalId
}

/** Write a line (or raw text) to an interactive local terminal's stdin. */
export async function terminalWrite(
  terminalId: string,
  data: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<void> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  await invokeFn<void>('terminal_write', { terminalId, data })
}

export async function terminalOutput(
  terminalId: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<TerminalOutputResult> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  return invokeFn<TerminalOutputResult>('terminal_output', { terminalId })
}

export async function terminalWaitForExit(
  terminalId: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<{ exitCode?: number | null; signal?: string | null }> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  return invokeFn('terminal_wait_for_exit', { terminalId })
}

export async function terminalKill(
  terminalId: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<void> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  await invokeFn<void>('terminal_kill', { terminalId })
}

export async function terminalRelease(
  terminalId: string,
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<void> {
  if (!native) throw new Error('浏览器预览模式不支持本地终端')
  await invokeFn<void>('terminal_release', { terminalId })
}

export type LocalTerminal = {
  terminalId: string
  name: string
  status: string
  exitCode?: number | null
  output: string
  truncated: boolean
  interactive?: boolean
}

export async function terminalList(
  invokeFn: InvokeFn = invoke,
  native = isTauriRuntime(),
): Promise<LocalTerminal[]> {
  if (!native) return []
  const items = await invokeFn<Array<{
    terminalId: string
    name: string
    status: string
    exitCode?: number | null
    output: string
    truncated: boolean
    interactive?: boolean
  }>>('terminal_list')
  return items.map((item) => ({
    terminalId: item.terminalId,
    name: item.name,
    status: item.status,
    exitCode: item.exitCode,
    output: item.output,
    truncated: item.truncated,
    interactive: item.interactive === true,
  }))
}

export type TerminalChunkEvent = {
  terminalId: string
  chunk: string
}

export type TerminalExitEvent = {
  terminalId: string
}

export async function listenForTerminalChunks(
  onChunk: (event: TerminalChunkEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined
  return listen<TerminalChunkEvent>('grok://terminal-chunk', ({ payload }) => {
    if (payload && typeof payload.terminalId === 'string' && typeof payload.chunk === 'string') {
      onChunk(payload)
    }
  })
}

export async function listenForTerminalExit(
  onExit: (event: TerminalExitEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined
  return listen<TerminalExitEvent>('grok://terminal-exit', ({ payload }) => {
    if (payload && typeof payload.terminalId === 'string') onExit(payload)
  })
}

export async function selectWorkspace(currentPath?: string): Promise<string | null> {
  if (!isTauriRuntime()) return null
  const selected = await open({ directory: true, multiple: false, defaultPath: currentPath })
  return typeof selected === 'string' ? selected : null
}

export async function selectFiles(currentPath?: string): Promise<string[]> {
  if (!isTauriRuntime()) return []
  const selected = await open({ multiple: true, defaultPath: currentPath })
  if (typeof selected === 'string') return [selected]
  return Array.isArray(selected) ? selected.filter((item): item is string => typeof item === 'string') : []
}

export async function listenForGrokEvents(
  onEvent: (event: AcpUiEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined

  return listenForRawGrokEvents((payload) => {
    const event = normalizeAcpEvent(payload)
    if (event) onEvent(event)
  })
}

export async function listenForRawGrokEvents(
  onPayload: (payload: unknown) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined
  return listen<unknown>('grok://message', ({ payload }) => onPayload(payload))
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function textContent(value: unknown) {
  const content = record(value)
  return typeof content?.text === 'string' ? content.text : ''
}

function pathsFromLocations(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const paths = value.flatMap((entry) => {
    const item = record(entry)
    return item && typeof item.path === 'string' ? [item.path] : []
  })
  return paths.length > 0 ? paths : undefined
}

function detailFromTool(update: Record<string, unknown>) {
  if (typeof update.content === 'string' && update.content.trim()) return update.content.trim()
  const rawInput = record(update.rawInput)
  if (rawInput) {
    if (typeof rawInput.path === 'string') return rawInput.path
    if (typeof rawInput.command === 'string') return rawInput.command
    if (typeof rawInput.query === 'string') return rawInput.query
  }
  const paths = pathsFromLocations(update.locations)
  if (paths?.[0]) return paths[0]
  if (Array.isArray(update.content)) {
    for (const block of update.content) {
      const row = record(block)
      if (!row) continue
      if (row.type === 'diff' && typeof row.path === 'string') return row.path
      const nested = record(row.content)
      if (nested && typeof nested.text === 'string' && nested.text.trim()) {
        return nested.text.trim().slice(0, 120)
      }
    }
  }
  return undefined
}

export function normalizeAcpEvent(payload: unknown): AcpUiEvent | null {
  const root = record(payload)
  if (!root) return null
  if (root.method === 'x.ai/git_head_changed') return { kind: 'workspace' }

  // Incoming agent requests are handled by GrokAcpClient; only parse if already shaped as UI event.
  if (root.kind === 'permission' && typeof root.requestId === 'number') {
    return root as AcpUiEvent
  }

  if (root.method !== 'session/update' && root.method !== 'x.ai/session/update') return null

  const params = record(root.params)
  const update = record(params?.update ?? params?.sessionUpdate)
  if (!update) return null
  const updateType = update.sessionUpdate

  if (updateType === 'tool_call' || updateType === 'tool_call_update') {
    return {
      kind: 'tool',
      toolCallId: typeof update.toolCallId === 'string' ? update.toolCallId : undefined,
      title: typeof update.title === 'string' ? update.title : 'Grok tool',
      status: typeof update.status === 'string' ? update.status : 'pending',
      toolKind: typeof update.kind === 'string' ? update.kind : undefined,
      detail: detailFromTool(update),
      paths: pathsFromLocations(update.locations),
    }
  }
  if (updateType === 'agent_message_chunk') {
    return { kind: 'message', text: textContent(update.content) }
  }
  if (updateType === 'agent_thought_chunk') {
    return { kind: 'thought', text: textContent(update.content) }
  }
  if (updateType === 'plan') {
    return { kind: 'plan', entries: Array.isArray(update.entries) ? update.entries : [] }
  }

  return null
}

export function parsePermissionRequest(payload: unknown): AcpUiEvent | null {
  const root = record(payload)
  if (!root || root.method !== 'session/request_permission') return null
  if (typeof root.id !== 'number') return null
  const params = record(root.params)
  const toolCall = record(params?.toolCall)
  const options = Array.isArray(params?.options)
    ? params.options.flatMap((value): PermissionOption[] => {
      const option = record(value)
      if (!option || typeof option.optionId !== 'string') return []
      return [{
        optionId: option.optionId,
        name: typeof option.name === 'string' ? option.name : option.optionId,
        kind: typeof option.kind === 'string' ? option.kind : 'allow_once',
      }]
    })
    : []
  const title = typeof toolCall?.title === 'string'
    ? toolCall.title
    : typeof toolCall?.toolCallId === 'string'
      ? `工具调用 ${toolCall.toolCallId}`
      : '需要审批的操作'
  return {
    kind: 'permission',
    requestId: root.id,
    toolCallId: typeof toolCall?.toolCallId === 'string' ? toolCall.toolCallId : undefined,
    title,
    options: options.length > 0
      ? options
      : [
          { optionId: 'allow-once', name: '允许一次', kind: 'allow_once' },
          { optionId: 'reject-once', name: '拒绝', kind: 'reject_once' },
        ],
  }
}
