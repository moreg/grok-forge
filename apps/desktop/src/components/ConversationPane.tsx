import { type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  MoreHorizontal,
  PanelRightOpen,
  Paperclip,
  Play,
  Plus,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import {
  getBackendStatus,
  readTextFile,
  selectFiles,
  writeTextFile,
  type AcpUiEvent,
  type BackendStatus,
  type PermissionOption,
} from '../lib/desktopBridge'
import {
  isCachedDataUrlPath,
  persistAttachmentList,
  resolveAttachmentList,
} from '../lib/attachmentStore'
import {
  contextUsageLevel,
  contextUsagePercent,
  formatContextUsageHint,
  formatContextUsageLabel,
  formatTokenCount,
  resolveContextUsage,
  type ContextUsageCost,
} from '../lib/contextUsage'
import {
  type ApprovalMode,
  type Task,
  attachmentLabel,
  buildAttachmentPrompt,
  helpMessage,
  isDataImageAttachment,
  matchInlineSlashCommands,
  modelLabel,
  pickAllowOption,
  readAttachmentsFromDataTransfer,
  readImageAttachmentsFromDataTransfer,
  reconnectDelayMs,
  reconnectToastMessage,
  statusLabel,
  titleFromPrompt,
  toggleTaskTag,
  toResourceBlocks,
} from '../lib/tasks'
import {
  eventMatchesShortcut,
  showDesktopNotification,
  type ShortcutMap,
} from '../lib/prefs'
import { loadMcpServers } from '../lib/mcp'
import {
  BILLING_POLL_INTERVAL_MS,
  GrokAcpClient,
  GrokRequestError,
  type BillingUsage,
  type WorkspaceData,
} from '../lib/grokAcpClient'
import { StreamPlainView } from '../lib/MarkdownView'
import { createStreamBatcher } from '../lib/streamBatch'
import { createWorkspaceRefreshController } from '../lib/workspaceRefresh'
import { asEvents } from './chatHelpers'
import type { PendingPermission, TaskPatch } from './types'
import { LiveThoughtPanel, LiveToolEventsPanel } from './LivePanels'
import { MessageList, PermissionBanner } from './MessageList'
import { ExecutionTimeline } from './ExecutionTimeline'
import { ChangeSummary } from './ChangeSummary'

type LiveToolEvent = Extract<AcpUiEvent, { kind: 'tool' }>
type AccountConnectionFailureKind = 'technical' | 'network' | 'authentication'

function classifyAccountConnectionFailure(error: unknown): {
  message: string
  kind: AccountConnectionFailureKind
  status: 'temporarily-unavailable' | 'relogin-required'
} {
  const message = error instanceof Error ? error.message : String(error)
  const errorDetails = error instanceof GrokRequestError && error.data !== undefined
    ? (() => { try { return JSON.stringify(error.data) } catch { return '' } })()
    : ''
  const combined = `${message} ${errorDetails}`
  if (error instanceof GrokRequestError && error.method === 'authenticate') {
    const explicitNetworkFailure = error.code === 'timeout'
      || error.code === 'transport'
      || /network|offline|connection (?:failed|reset|refused)|timed? out|temporarily unavailable|网络|连接失败/i.test(combined)
    return explicitNetworkFailure
      ? { message, kind: 'network', status: 'temporarily-unavailable' }
      : { message, kind: 'authentication', status: 'relogin-required' }
  }
  if (/invalid_grant|revoked|session expired|re-?authenticate|authentication required|auth_required|not authenticated|no session is available|需要重新登录|Unauthorized|未提供 OIDC/i.test(combined)) {
    return { message, kind: 'authentication', status: 'relogin-required' }
  }
  if (/network|offline|connection (?:failed|reset|refused)|timed? out|temporarily unavailable|网络|连接失败|连接中断/i.test(combined)) {
    return { message, kind: 'network', status: 'temporarily-unavailable' }
  }
  return { message, kind: 'technical', status: 'temporarily-unavailable' }
}

function ComposerImageChip({
  file,
  onRemove,
}: {
  file: string
  onRemove: () => void
}) {
  const [src, setSrc] = useState(isDataImageAttachment(file) ? file : '')
  useEffect(() => {
    let cancelled = false
    if (isDataImageAttachment(file)) {
      setSrc(file)
      return
    }
    if (!isCachedDataUrlPath(file)) {
      setSrc('')
      return
    }
    void readTextFile(file)
      .then((raw) => {
        if (!cancelled && raw.startsWith('data:')) setSrc(raw)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [file])

  if (!src) {
    return (
      <button
        type="button"
        className="attachment-chip"
        onClick={onRemove}
        title={file}
      >
        <Paperclip size={11} />
        {attachmentLabel(file)}
        <X size={11} />
      </button>
    )
  }

  return (
    <div className="attachment-image-card">
      <img src={src} alt={attachmentLabel(file)} className="attachment-preview" />
      <button
        type="button"
        className="attachment-image-remove"
        aria-label={`移除 ${attachmentLabel(file)}`}
        title="移除图片"
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function ConversationPane({
  task,
  accountId,
  workspacePath,
  workspace,
  approvalMode,
  onApprovalMode,
  onWorkspacePath,
  onWorkspaceData,
  onOpenReview,
  onConnectionChange,
  onBillingChange,
  onBillingRefreshingChange,
  onTaskPatch,
  onNewTask,
  onRenameTask,
  onDeleteTask,
  onClearTask,
  onOpenCommands,
  commandDraft,
  onCommandDraftConsumed,
  autoReconnect,
  preferredModel,
  desktopNotifications,
  shortcuts,
  highlightMessageIndex = null,
  onHighlightConsumed,
  onAccountAuthStatus,
  onAccountConnectionError,
}: {
  task: Task
  accountId: string | null
  workspacePath: string
  workspace: WorkspaceData | null
  approvalMode: ApprovalMode
  onApprovalMode: (mode: ApprovalMode) => void
  onWorkspacePath: (path: string) => void
  onWorkspaceData: (data: WorkspaceData) => void
  onOpenReview: () => void
  onConnectionChange?: (connected: boolean) => void
  onBillingChange?: (billing: BillingUsage | null) => void
  onBillingRefreshingChange?: (refreshing: boolean) => void
  onTaskPatch: (taskId: string, patch: TaskPatch) => void
  onNewTask: () => void
  onRenameTask: (taskId: string, title: string) => void
  onDeleteTask: (taskId: string) => void
  onClearTask: (taskId: string) => void
  highlightMessageIndex?: number | null
  onHighlightConsumed?: () => void
  onAccountAuthStatus?: (accountId: string, status: 'valid' | 'temporarily-unavailable' | 'relogin-required') => void
  onAccountConnectionError?: (accountId: string, message: string, kind: AccountConnectionFailureKind) => void
  onOpenCommands: () => void
  commandDraft: string
  onCommandDraftConsumed: () => void
  autoReconnect: boolean
  preferredModel: string
  desktopNotifications: boolean
  shortcuts: ShortcutMap
}) {
  const [input, setInput] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [attachments, setAttachments] = useState<string[]>(task.attachments ?? [])
  const [backend, setBackend] = useState<BackendStatus>({ mode: 'preview', installed: true, version: '检测中…' })
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [modeOpen, setModeOpen] = useState(false)
  const [taskMenuOpen, setTaskMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(task.title)
  const [tagDraft, setTagDraft] = useState('')
  const [tagEditorOpen, setTagEditorOpen] = useState(false)
  const [permissionQueue, setPermissionQueue] = useState<PendingPermission[]>([])
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [toastDismissed, setToastDismissed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  /** Latest ACP usage_update for the task this pane is displaying. */
  const [agentUsage, setAgentUsage] = useState<{
    used: number
    size: number
    cost?: ContextUsageCost
    at: number
  } | null>(null)
  const slashSuggestions = useMemo(
    () => (slashDismissed ? [] : matchInlineSlashCommands(input)),
    [input, slashDismissed],
  )
  const clientRef = useRef<GrokAcpClient | null>(null)
  const streamTaskIdRef = useRef(task.id)
  /** Currently rendered task id (may differ from streamTaskId mid-switch). */
  const displayTaskIdRef = useRef(task.id)
  displayTaskIdRef.current = task.id
  /** True while an ACP prompt turn is open (blocks late chunks after finalize). */
  const streamOpenRef = useRef(false)
  /** Monotonic id so concurrent/stale billing polls cannot overwrite newer results. */
  const billingRefreshSeqRef = useRef(0)
  const promptGenerationRef = useRef(0)
  const approvalModeRef = useRef(approvalMode)
  const autoReconnectRef = useRef(autoReconnect)
  const notificationsRef = useRef(desktopNotifications)
  const intentionalDisconnectRef = useRef(false)
  const connectInFlightRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendPromptRef = useRef<(text: string, files?: string[]) => void>(() => undefined)
  const connectRef = useRef<() => Promise<void>>(async () => undefined)
  const preferredModelRef = useRef(preferredModel)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const stopTaskRef = useRef<() => Promise<void>>(async () => undefined)
  const workspacePathRef = useRef(workspacePath)
  const accountIdRef = useRef(accountId)
  const onTaskPatchRef = useRef(onTaskPatch)
  onTaskPatchRef.current = onTaskPatch
  /** Coalesce token-level message/thought patches to one React update per frame. */
  const streamBatcherRef = useRef<ReturnType<typeof createStreamBatcher> | null>(null)
  if (!streamBatcherRef.current) {
    streamBatcherRef.current = createStreamBatcher({
      flush: (batch) => {
        // Do not bump updatedAt — keeps sidebar sort/memo stable during streaming.
        const patch: TaskPatch = { status: 'running' }
        if (batch.message) patch.appendLiveMessage = batch.message
        if (batch.thought) patch.appendLiveThought = batch.thought
        onTaskPatchRef.current(batch.taskId, patch)
      },
    })
  }
  const onWorkspaceDataRef = useRef(onWorkspaceData)
  onWorkspaceDataRef.current = onWorkspaceData
  const workspaceRefreshRef = useRef<ReturnType<typeof createWorkspaceRefreshController> | null>(null)
  if (!workspaceRefreshRef.current) {
    workspaceRefreshRef.current = createWorkspaceRefreshController({
      load: async () => {
        const client = clientRef.current
        if (!client) return
        const data = await client.loadWorkspaceData()
        onWorkspaceDataRef.current(data)
      },
    })
  }
  approvalModeRef.current = approvalMode
  autoReconnectRef.current = autoReconnect
  preferredModelRef.current = preferredModel
  notificationsRef.current = desktopNotifications
  workspacePathRef.current = workspacePath
  accountIdRef.current = accountId
  const showReconnectToast = autoReconnect && reconnectAttempt > 0 && !connected && !toastDismissed
  const permission = permissionQueue[0] ?? null

  const liveEvents = asEvents(task.liveEvents)
  const branch = workspace?.branch

  useEffect(() => {
    setRenameValue(task.title)
    setRenaming(false)
    setTaskMenuOpen(false)
    setTagDraft('')
    setTagEditorOpen(false)
    setAttachments(task.attachments ?? [])
    setInput('')
    setModeOpen(false)
    setDragOver(false)
    setAgentUsage(null)
  }, [task.id])

  useEffect(() => {
    setRenameValue(task.title)
  }, [task.title])

  useEffect(() => {
    setAttachments(task.attachments ?? [])
  }, [task.id, task.attachments])

  useEffect(() => {
    if (!commandDraft) return
    setInput(commandDraft)
    onCommandDraftConsumed()
  }, [commandDraft, onCommandDraftConsumed])

  useEffect(() => {
    void getBackendStatus().then((status) => {
      setBackend(status)
      if (!workspacePath && status.workspacePath) onWorkspacePath(status.workspacePath)
    }).catch((error) => setConnectionError(error instanceof Error ? error.message : String(error)))
    return () => {
      streamBatcherRef.current?.flushNow()
      if (clientRef.current) void clientRef.current.disconnect()
      onConnectionChange?.(false)
    }
  }, [])

  useEffect(() => {
    const refresh = workspaceRefreshRef.current
    if (!connected || !refresh) {
      refresh?.stop()
      return
    }
    refresh.startPolling()
    return () => refresh.stop()
  }, [connected])

  useEffect(() => {
    const onRefresh = () => {
      workspaceRefreshRef.current?.requestNow()
    }
    window.addEventListener('grok-forge-refresh-workspace', onRefresh)
    return () => window.removeEventListener('grok-forge-refresh-workspace', onRefresh)
  }, [])

  const handleEvent = useCallback((event: AcpUiEvent) => {
    const taskId = streamTaskIdRef.current
    if (event.kind === 'workspace') {
      workspaceRefreshRef.current?.request()
      return
    }
    if (event.kind === 'usage') {
      // Attribute to the stream task; only update the meter when that task is on screen.
      if (streamTaskIdRef.current === displayTaskIdRef.current) {
        setAgentUsage({
          used: event.used,
          size: event.size,
          cost: event.cost,
          at: Date.now(),
        })
      }
      return
    }
    if (event.kind === 'permission') {
      if (approvalModeRef.current === 'observe') {
        const allow = pickAllowOption(event.options)
        if (allow) {
          void clientRef.current?.respondPermission(event.requestId, {
            outcome: 'selected',
            optionId: allow.optionId,
          })
          onTaskPatch(taskId, {
            appendMessage: { role: 'system', content: `观察模式已自动允许：${event.title}` },
            updatedAt: Date.now(),
          })
          return
        }
      }
      setPermissionQueue((queue) => {
        if (queue.some((item) => item.requestId === event.requestId)) return queue
        return [...queue, event]
      })
      void showDesktopNotification('需要审批', event.title, notificationsRef.current)
      return
    }
    // Drop late stream chunks after the prompt turn was finalized/cancelled.
    if (!streamOpenRef.current && (event.kind === 'message' || event.kind === 'thought' || event.kind === 'plan' || event.kind === 'tool')) {
      return
    }
    if (event.kind === 'message') {
      // Batch tokens per animation frame (see createStreamBatcher).
      streamBatcherRef.current?.pushMessage(taskId, event.text)
      return
    }
    if (event.kind === 'plan') {
      onTaskPatch(taskId, {
        appendLiveEvent: event,
        // Merge so prior tool rows + step timestamps survive plan updates.
        mergePlan: event.entries,
        status: 'running',
        updatedAt: Date.now(),
      })
      return
    }
    if (event.kind === 'tool') {
      onTaskPatch(taskId, {
        appendLiveEvent: event,
        mergeTool: event,
        status: 'running',
        updatedAt: Date.now(),
      })
      workspaceRefreshRef.current?.request()
      return
    }
    if (event.kind === 'thought') {
      streamBatcherRef.current?.pushThought(taskId, event.text)
      return
    }
  }, [onTaskPatch])

  const refreshBilling = useCallback(async () => {
    const client = clientRef.current
    if (!client) {
      onBillingChange?.(null)
      onBillingRefreshingChange?.(false)
      return
    }
    const seq = ++billingRefreshSeqRef.current
    onBillingRefreshingChange?.(true)
    try {
      const usage = await client.fetchBilling()
      // Drop stale responses from overlapping manual / interval polls.
      if (seq !== billingRefreshSeqRef.current) return
      // Only apply a successful snapshot. Null/parse-miss and thrown errors keep
      // the last good meter so a blip does not flash offline fake usage.
      if (usage) onBillingChange?.(usage)
    } catch {
      // keep previous billing snapshot
    } finally {
      if (seq === billingRefreshSeqRef.current) {
        onBillingRefreshingChange?.(false)
      }
    }
  }, [onBillingChange, onBillingRefreshingChange])

  const disconnect = async (intentional = true) => {
    intentionalDisconnectRef.current = intentional
    // Invalidate in-flight billing polls so they cannot re-apply after clear.
    billingRefreshSeqRef.current += 1
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    promptGenerationRef.current += 1
    streamOpenRef.current = false
    // Apply any buffered stream tokens before tearing down the client.
    streamBatcherRef.current?.flushNow()
    setPermissionQueue([])
    if (clientRef.current) {
      await clientRef.current.disconnect()
      clientRef.current = null
    }
    setConnected(false)
    onConnectionChange?.(false)
    onBillingChange?.(null)
    onBillingRefreshingChange?.(false)
  }

  const connect = async () => {
    if (backend.mode !== 'native' || connecting || connectInFlightRef.current) return
    if (connected) {
      await disconnect(true)
      return
    }
    const path = workspacePathRef.current
    if (!path) {
      setConnectionError('请先选择工作区')
      return
    }
    const selectedAccountId = accountIdRef.current
    if (!selectedAccountId) {
      setConnectionError('请先添加或选择 Grok 账号')
      return
    }
    if (!task.accountId) {
      setConnectionError('请先绑定当前任务到所选账号')
      return
    }
    if (task.accountId !== selectedAccountId) {
      setConnectionError('任务归属账号与当前账号不一致，请先切换账号')
      return
    }
    // Capture task identity at start so a mid-connect task switch does not mis-attribute the session.
    const connectTaskId = task.id
    const connectSessionKey = task.sessionKey ?? task.id
    const connectAcpSessionId = task.acpSessionId
    connectInFlightRef.current = true
    setConnecting(true)
    setConnectionError('')
    intentionalDisconnectRef.current = false
    const candidateClient = new GrokAcpClient()
    let connectionFailure: ReturnType<typeof classifyAccountConnectionFailure> | null = null
    try {
      const client = candidateClient
      client.setAccountId(selectedAccountId)
      client.setTaskAccountId(task.accountId)
      client.onEvent(handleEvent)
      client.setMcpServers(loadMcpServers())
      client.setPreferredModel(preferredModelRef.current)
      const session = await client.connect(
        path,
        connectSessionKey,
        loadMcpServers(),
        connectAcpSessionId,
      )
      onTaskPatch(connectTaskId, {
        acpSessionId: session.sessionId,
        appendMessage: session.restored
          ? {
              role: 'system',
              content: `已恢复会话 ${session.sessionId}${
                preferredModelRef.current ? ` · 模型 ${modelLabel(preferredModelRef.current)}` : ''
              }`,
            }
          : undefined,
        updatedAt: Date.now(),
      })
      clientRef.current = client
      setConnected(true)
      setReconnectAttempt(0)
      setToastDismissed(false)
      onConnectionChange?.(true)
      onAccountAuthStatus?.(selectedAccountId, 'valid')
      // Workspace load is best-effort — do not tear down a healthy ACP session if git fails.
      try {
        onWorkspaceData(await client.loadWorkspaceData())
      } catch {
        // ignore
      }
      // Live coding-credit usage for the sidebar meter (also best-effort).
      // Interval effect also refreshes once `connected` flips true.
    } catch (error) {
      connectionFailure = classifyAccountConnectionFailure(error)
      setConnectionError(connectionFailure.message)
      onAccountAuthStatus?.(selectedAccountId, connectionFailure.status)
      setConnected(false)
      onConnectionChange?.(false)
      billingRefreshSeqRef.current += 1
      onBillingChange?.(null)
      onBillingRefreshingChange?.(false)
      await candidateClient.disconnect().catch(() => undefined)
      if (clientRef.current === candidateClient) clientRef.current = null
      if (connectionFailure.kind === 'network' && autoReconnectRef.current && !intentionalDisconnectRef.current) {
        setToastDismissed(false)
        setReconnectAttempt((current) => current + 1)
      }
    } finally {
      connectInFlightRef.current = false
      setConnecting(false)
      if (connectionFailure) {
        onAccountConnectionError?.(selectedAccountId, connectionFailure.message, connectionFailure.kind)
      }
    }
  }
  connectRef.current = connect

  useEffect(() => {
    const onSwitch = () => {
      void (async () => {
        await stopTaskRef.current().catch(() => undefined)
        await disconnect(true).catch(() => undefined)
        window.dispatchEvent(new CustomEvent('grok-forge-account-switch-ready'))
      })()
    }
    const onOidcLogin = () => {
      void (async () => {
        if (clientRef.current) await disconnect(true).catch(() => undefined)
        const client = new GrokAcpClient()
        client.setAccountId(accountIdRef.current)
        client.setTaskAccountId(task.accountId)
        client.requestInteractiveAuthentication()
        client.onEvent(handleEvent)
        client.setMcpServers(loadMcpServers())
        client.setPreferredModel(preferredModelRef.current)
        try {
          setConnecting(true)
          setConnectionError('')
          const currentTask = displayTaskIdRef.current
          const session = await client.connect(workspacePathRef.current, task.sessionKey ?? task.id, loadMcpServers())
          clientRef.current = client
          onTaskPatch(currentTask, { acpSessionId: session.sessionId, updatedAt: Date.now() })
          setConnected(true)
          onConnectionChange?.(true)
          if (accountIdRef.current) onAccountAuthStatus?.(accountIdRef.current, 'valid')
        } catch (error) {
          const failure = classifyAccountConnectionFailure(error)
          setConnectionError(failure.message)
          await client.disconnect().catch(() => undefined)
          if (accountIdRef.current) {
            onAccountAuthStatus?.(accountIdRef.current, failure.status)
            onAccountConnectionError?.(accountIdRef.current, failure.message, failure.kind)
          }
        } finally {
          setConnecting(false)
        }
      })()
    }
    const onAccountConnect = () => {
      if (autoReconnectRef.current) void connectRef.current()
    }
    window.addEventListener('grok-forge-account-switch', onSwitch)
    window.addEventListener('grok-forge-oidc-login', onOidcLogin)
    window.addEventListener('grok-forge-account-connect', onAccountConnect)
    return () => {
      window.removeEventListener('grok-forge-account-switch', onSwitch)
      window.removeEventListener('grok-forge-oidc-login', onOidcLogin)
      window.removeEventListener('grok-forge-account-connect', onAccountConnect)
    }
  }, [handleEvent, onAccountAuthStatus, onAccountConnectionError, onConnectionChange, onTaskPatch, task.id, task.sessionKey])

  // Refresh billing while connected so the sidebar meter stays current.
  useEffect(() => {
    if (!connected) return
    void refreshBilling()
    const timer = window.setInterval(() => {
      void refreshBilling()
    }, BILLING_POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [connected, refreshBilling])

  // Sidebar (and others) can request an immediate billing refresh.
  useEffect(() => {
    const onRefresh = () => {
      void refreshBilling()
    }
    window.addEventListener('grok-forge-refresh-billing', onRefresh)
    return () => window.removeEventListener('grok-forge-refresh-billing', onRefresh)
  }, [refreshBilling])

  // One-shot open-to-connect per workspace / auto-connect enable. Retries go
  // through the backoff effect only — never re-fire on every connecting flip.
  const openConnectArmedRef = useRef(true)
  const prevWorkspacePathRef = useRef(workspacePath)
  const prevAutoReconnectRef = useRef(autoReconnect)

  useEffect(() => {
    const previous = prevWorkspacePathRef.current
    prevWorkspacePathRef.current = workspacePath
    intentionalDisconnectRef.current = false
    openConnectArmedRef.current = true
    if (!previous || previous === workspacePath) return
    if (clientRef.current) {
      void disconnect(false)
    }
  }, [workspacePath])

  useEffect(() => {
    const wasOn = prevAutoReconnectRef.current
    prevAutoReconnectRef.current = autoReconnect
    if (!wasOn && autoReconnect) {
      // User re-enabled auto-connect: allow one fresh open attempt.
      openConnectArmedRef.current = true
      intentionalDisconnectRef.current = false
    }
  }, [autoReconnect])

  useEffect(() => {
    if (!autoReconnect) return
    if (backend.mode !== 'native' || !workspacePath) return
    if (!accountId || !task.accountId || task.accountId !== accountId) return
    if (!openConnectArmedRef.current) return
    if (connected || connecting || connectInFlightRef.current) return
    if (intentionalDisconnectRef.current) return
    openConnectArmedRef.current = false
    void connectRef.current()
  }, [accountId, autoReconnect, backend.mode, task.accountId, workspacePath])

  useEffect(() => {
    if (!autoReconnect || backend.mode !== 'native') return
    if (connected || connecting || connectInFlightRef.current) return
    if (intentionalDisconnectRef.current) return
    if (reconnectAttempt <= 0 || reconnectAttempt > 5) return
    const delay = reconnectDelayMs(reconnectAttempt)
    reconnectTimerRef.current = setTimeout(() => {
      void connectRef.current()
    }, delay)
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [autoReconnect, backend.mode, connected, connecting, reconnectAttempt])

  useEffect(() => {
    if (reconnectAttempt > 0) setToastDismissed(false)
  }, [reconnectAttempt])

  // Push model changes to the live ACP session when already connected.
  useEffect(() => {
    const client = clientRef.current
    if (!client || !connected || !preferredModel) return
    if (client.preferredModel === preferredModel) return
    void client.setSessionModel(preferredModel)
      .then((result) => {
        const label = modelLabel(preferredModel)
        const content = result.applied
          ? `已切换模型为 ${label}`
          : result.mode === 'pending'
            ? `已记住模型 ${label}（当前运行时不支持即时切换，下次新建会话生效）`
            : `已记住模型偏好 ${label}`
        onTaskPatch(task.id, {
          appendMessage: { role: 'system', content },
          updatedAt: Date.now(),
        })
      })
      .catch((error) => {
        setConnectionError(error instanceof Error ? error.message : String(error))
      })
  }, [preferredModel, connected, onTaskPatch, task.id])

  // Health-check: only tear down when the session is actually gone, not on transient git noise.
  // Workspace file polling already runs every 1.5s — this interval only watches session liveness.
  useEffect(() => {
    if (!connected || !autoReconnect) return
    let failures = 0
    const timer = window.setInterval(() => {
      const client = clientRef.current
      if (!client) {
        failures += 1
      } else if (!client.activeSessionId) {
        failures += 1
      } else {
        failures = 0
        return
      }
      if (failures >= 2) {
        failures = 0
        void disconnect(false).then(() => {
          if (autoReconnectRef.current) setReconnectAttempt((current) => Math.max(1, current + 1))
        })
      }
    }, 4_000)
    return () => window.clearInterval(timer)
  }, [connected, autoReconnect])

  const stopTask = async () => {
    if (!clientRef.current) return
    try {
      // Invalidate any in-flight promptBlocks continuation so it cannot double-finalize.
      promptGenerationRef.current += 1
      await clientRef.current.cancel()
      streamOpenRef.current = false
      streamBatcherRef.current?.flushNow()
      setPermissionQueue([])
      onTaskPatch(streamTaskIdRef.current, {
        finalizeAssistant: true,
        status: 'idle',
        appendMessage: { role: 'system', content: '已请求停止当前执行。' },
        updatedAt: Date.now(),
      })
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
    }
  }
  stopTaskRef.current = stopTask

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (eventMatchesShortcut(event, shortcuts.stopTask)) {
        event.preventDefault()
        void stopTaskRef.current()
      }
      if (eventMatchesShortcut(event, shortcuts.focusComposer)) {
        event.preventDefault()
        composerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  const respondPermission = async (option: PermissionOption) => {
    const current = permissionQueue[0]
    if (!current || !clientRef.current) return
    const requestId = current.requestId
    const title = current.title
    setPermissionQueue((queue) => queue.filter((item) => item.requestId !== requestId))
    try {
      await clientRef.current.respondPermission(requestId, {
        outcome: 'selected',
        optionId: option.optionId,
      })
      onTaskPatch(streamTaskIdRef.current, {
        appendMessage: {
          role: 'system',
          content: option.kind.startsWith('reject')
            ? `已拒绝：${title}`
            : `已允许：${title}`,
        },
        updatedAt: Date.now(),
      })
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
    }
  }

  const sendPrompt = (prompt: string, extraAttachments: string[] = attachments) => {
    if (task.status === 'running' || streamOpenRef.current) {
      setConnectionError('当前任务仍在执行，请先停止或等待完成后再发送。')
      return
    }

    const nextTitle = task.title === '准备开始' || task.messages.length === 0
      ? (prompt.trim()
        ? titleFromPrompt(prompt)
        : (extraAttachments.length > 0 ? '图片附件' : '准备开始'))
      : task.title
    const submittedTaskId = task.id
    const sessionKey = task.sessionKey ?? task.id
    const generation = ++promptGenerationRef.current
    streamTaskIdRef.current = submittedTaskId
    // Keep user-visible content as the typed prompt; images render from message.attachments.
    const displayContent = prompt.trim()
    const willSend = Boolean(connected && clientRef.current)

    // Drop any leftover tokens from a previous turn before opening a new stream.
    streamBatcherRef.current?.reset()
    // Use appendMessage so concurrent live patches are not wiped by a stale messages snapshot.
    onTaskPatch(submittedTaskId, {
      title: nextTitle,
      appendMessage: {
        role: 'user',
        content: displayContent,
        attachments: extraAttachments.length > 0 ? extraAttachments : undefined,
      },
      liveMessage: '',
      liveThought: '',
      liveEvents: [],
      planSteps: [],
      attachments: [],
      status: willSend ? 'running' : task.status,
      updatedAt: Date.now(),
    })
    setAttachments([])

    if (willSend && clientRef.current) {
      streamOpenRef.current = true
      void (async () => {
        // Resolve workspace-cache .dataurl files back to data: URLs for the agent.
        const resolved = await resolveAttachmentList(extraAttachments, readTextFile)
        if (promptGenerationRef.current !== generation) return
        const textForAgent = buildAttachmentPrompt(prompt, resolved)
        const blocks = [
          { type: 'text' as const, text: textForAgent || prompt || '请查看附件。' },
          ...toResourceBlocks(resolved),
        ]
        try {
          await clientRef.current?.promptBlocks(blocks, sessionKey)
          if (promptGenerationRef.current !== generation) return
          streamOpenRef.current = false
          streamBatcherRef.current?.flushNow()
          onTaskPatch(submittedTaskId, { finalizeAssistant: true, status: 'done', updatedAt: Date.now() })
          void showDesktopNotification('任务完成', nextTitle, notificationsRef.current)
        } catch (error) {
          if (promptGenerationRef.current !== generation) return
          streamOpenRef.current = false
          streamBatcherRef.current?.flushNow()
          const message = error instanceof Error ? error.message : String(error)
          setConnectionError(message)
          const cancelled = message.includes('取消') || message.toLowerCase().includes('cancel')
          onTaskPatch(submittedTaskId, {
            finalizeAssistant: true,
            status: 'idle',
            appendMessage: cancelled
              ? { role: 'system', content: '本轮执行已取消。' }
              : undefined,
            updatedAt: Date.now(),
          })
          if (!message.includes('取消') && !message.toLowerCase().includes('cancel')) {
            void showDesktopNotification('任务失败', message, notificationsRef.current)
          }
        }
      })()
    } else if (backend.mode === 'native') {
      onTaskPatch(submittedTaskId, {
        appendMessage: {
          role: 'system',
          content: '未连接 Grok，消息仅保存在本地，未发送到运行时。请先连接后再试。',
        },
        updatedAt: Date.now(),
      })
      setConnectionError('未连接 Grok，消息未发送。请先点击「连接 Grok」。')
    }
  }
  sendPromptRef.current = sendPrompt

  useEffect(() => {
    const onAutoSend = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail.trim()) sendPromptRef.current(detail.trim())
    }
    window.addEventListener('grok-forge-auto-send', onAutoSend)
    return () => window.removeEventListener('grok-forge-auto-send', onAutoSend)
  }, [])

  const runSlashCommand = (raw: string) => {
    const command = raw.trim().toLowerCase().split(/\s+/)[0]
    switch (command) {
      case '/new':
        onNewTask()
        return true
      case '/clear':
        onClearTask(task.id)
        return true
      case '/review':
        onOpenReview()
        return true
      case '/stop':
        void stopTask()
        return true
      case '/disconnect':
        void disconnect()
        return true
      case '/help':
        onTaskPatch(task.id, { appendMessage: helpMessage(), updatedAt: Date.now() })
        return true
      default:
        return false
    }
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const prompt = input.trim()
    if (!prompt && attachments.length === 0) return
    if (prompt.startsWith('/')) {
      setInput('')
      if (!runSlashCommand(prompt)) {
        onTaskPatch(task.id, {
          appendMessage: { role: 'system', content: `未知命令：${prompt}\n输入 /help 查看可用命令。` },
          updatedAt: Date.now(),
        })
      }
      return
    }
    if (task.status === 'running' || streamOpenRef.current) {
      setConnectionError('当前任务仍在执行，请先停止或等待完成后再发送。')
      return
    }
    setInput('')
    sendPrompt(prompt)
  }

  const attachFiles = async () => {
    const files = await selectFiles(workspacePath || undefined)
    if (files.length === 0) {
      onOpenCommands()
      return
    }
    const next = [...new Set([...attachments, ...files])]
    setAttachments(next)
    onTaskPatch(task.id, { attachments: next, updatedAt: Date.now() })
  }

  const onComposerPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = await readImageAttachmentsFromDataTransfer(event.clipboardData?.items)
    if (images.length === 0) return
    event.preventDefault()
    // Persist data: URLs into workspace cache so task snapshots stay small.
    const stored = await persistAttachmentList(
      images,
      workspacePathRef.current,
      writeTextFile,
      readTextFile,
    )
    const next = [...attachments, ...stored]
    setAttachments(next)
    onTaskPatch(task.id, {
      attachments: next,
      appendMessage: {
        role: 'system',
        content: `已从剪贴板附加 ${images.length} 张图片。`,
      },
      updatedAt: Date.now(),
    })
  }

  const onComposerDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const onComposerDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setDragOver(false)
  }

  const onComposerDrop = async (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault()
    setDragOver(false)
    const dropped = await readAttachmentsFromDataTransfer(event.dataTransfer)
    if (dropped.length === 0) return
    const stored = await persistAttachmentList(
      dropped,
      workspacePathRef.current,
      writeTextFile,
      readTextFile,
    )
    const next = [...attachments, ...stored]
    setAttachments(next)
    onTaskPatch(task.id, {
      attachments: next,
      appendMessage: {
        role: 'system',
        content: `已拖入 ${dropped.length} 个附件。`,
      },
      updatedAt: Date.now(),
    })
  }

  const applySlashSuggestion = (command: string) => {
    setInput(command)
    setSlashIndex(0)
    setSlashDismissed(false)
    // Keep focus for immediate Enter to run the command.
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashIndex((index) => Math.min(slashSuggestions.length - 1, index + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) => Math.max(0, index - 1))
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const pick = slashSuggestions[Math.min(slashIndex, slashSuggestions.length - 1)]
        if (pick) applySlashSuggestion(pick.command)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        // Dismiss popup only — keep the typed /token.
        setSlashDismissed(true)
        setSlashIndex(0)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        // If the typed token is an incomplete match, complete first; if exact, run.
        const exact = slashSuggestions.find((item) => item.command === input.trim())
        if (!exact && slashSuggestions.length > 0) {
          event.preventDefault()
          const pick = slashSuggestions[Math.min(slashIndex, slashSuggestions.length - 1)]
          if (pick) applySlashSuggestion(pick.command)
          return
        }
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  useEffect(() => {
    setSlashIndex(0)
    setSlashDismissed(false)
  }, [input])

  const commitRename = () => {
    const next = renameValue.trim()
    if (next) onRenameTask(task.id, next)
    setRenaming(false)
    setTaskMenuOpen(false)
  }

  const addTag = () => {
    const next = toggleTaskTag(task.tags, tagDraft)
    if (next.length === (task.tags?.length ?? 0) && !tagDraft.trim()) {
      setTagEditorOpen(false)
      return
    }
    onTaskPatch(task.id, { tags: next, updatedAt: Date.now() })
    setTagDraft('')
    setTagEditorOpen(false)
  }

  const removeTag = (tag: string) => {
    onTaskPatch(task.id, { tags: toggleTaskTag(task.tags, tag), updatedAt: Date.now() })
  }

  const modeLabel = approvalMode === 'approve' ? '审批模式' : '观察模式'
  const connectLabel = connecting
    ? '连接中…'
    : backend.mode === 'preview'
      ? '浏览器预览'
      : connected
        ? '断开 Grok'
        : '连接 Grok'
  const workspaceShortName = workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || '请选择工作区'
  const tags = task.tags ?? []

  const contextUsage = useMemo(
    () => resolveContextUsage(agentUsage, {
      messages: task.messages,
      liveMessage: task.liveMessage,
      liveThought: task.liveThought,
      planSteps: task.planSteps,
      modelId: preferredModel,
    }),
    [
      agentUsage,
      task.messages,
      task.liveMessage,
      task.liveThought,
      task.planSteps,
      preferredModel,
    ],
  )
  const contextPercent = contextUsagePercent(contextUsage.used, contextUsage.size)
  const contextLevel = contextUsageLevel(contextPercent)
  const contextLabel = formatContextUsageLabel(contextUsage)
  const contextHint = formatContextUsageHint(contextUsage)

  return (
    <main className="conversation-pane">
      <header className="task-header">
        <div className="task-header-main">
          {renaming ? (
            <form className="rename-form" onSubmit={(event) => { event.preventDefault(); commitRename() }}>
              <input aria-label="重命名任务" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus onBlur={commitRename} />
            </form>
          ) : (
            <h1>{task.title}</h1>
          )}
          <div className="task-meta">
            <span className="task-meta-item" title={branch || '无分支'}>
              <GitBranch size={11} aria-hidden="true" />
              <span>{branch || '无分支'}</span>
            </span>
            <span className="meta-sep" aria-hidden="true">·</span>
            <span className="task-meta-item task-meta-path" title={workspacePath || '请选择工作区'}>
              {workspaceShortName}
            </span>
            <span className="meta-sep" aria-hidden="true">·</span>
            <span className="task-meta-item" aria-label="当前模型">{modelLabel(preferredModel)}</span>
            {(tags.length > 0 || tagEditorOpen) && (
              <>
                <span className="meta-sep" aria-hidden="true">·</span>
                <div className="task-tag-editor" aria-label="任务标签">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="tag-chip"
                      aria-label={`移除标签 ${tag}`}
                      onClick={() => removeTag(tag)}
                      title="点击移除标签"
                    >
                      #{tag}
                      <X size={9} aria-hidden="true" />
                    </button>
                  ))}
                  {tagEditorOpen ? (
                    <form
                      className="tag-add-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        addTag()
                      }}
                    >
                      <input
                        aria-label="添加任务标签"
                        placeholder="标签名"
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onBlur={() => {
                          if (!tagDraft.trim()) setTagEditorOpen(false)
                        }}
                        autoFocus
                      />
                      <button type="submit" aria-label="确认添加标签">添加</button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="tag-add-trigger"
                      aria-label="添加任务标签"
                      onClick={() => setTagEditorOpen(true)}
                    >
                      <Plus size={10} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="header-actions">
          <span className={`task-status-pill status-${task.status}`} title={`任务状态：${statusLabel(task.status)}`}>
            <span className="task-status-dot" aria-hidden="true" />
            {statusLabel(task.status)}
          </span>
          {task.status === 'running' && connected && (
            <button className="stop-button" type="button" aria-label="停止任务" onClick={() => void stopTask()}>
              <Square size={12} fill="currentColor" /> 停止
            </button>
          )}
          <button
            className={`status-button ${connected ? 'connected' : ''}`}
            onClick={() => void connect()}
            disabled={backend.mode === 'preview' || connecting}
            title={connectionError || backend.version}
            type="button"
            aria-label={connectLabel}
          >
            <span /> {connectLabel}
          </button>
          {autoReconnect && reconnectAttempt > 0 && !connected && (
            <span className="reconnect-pill" role="status" aria-label="自动重连进度">
              自动重连 {Math.min(reconnectAttempt, 5)}/5
            </span>
          )}
          <div className="task-menu-wrap">
            <button className="icon-button" aria-label="任务选项" type="button" aria-expanded={taskMenuOpen} onClick={() => setTaskMenuOpen((open) => !open)}>
              <MoreHorizontal size={16} />
            </button>
            {taskMenuOpen && (
              <div className="task-menu" role="menu" aria-label="任务选项菜单">
                <button type="button" role="menuitem" onClick={() => { setRenaming(true); setTaskMenuOpen(false) }}>重命名任务</button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTagEditorOpen(true)
                    setTaskMenuOpen(false)
                  }}
                >
                  添加标签
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (streamTaskIdRef.current === task.id && streamOpenRef.current) void stopTask()
                    onClearTask(task.id)
                    setTaskMenuOpen(false)
                  }}
                >
                  清空对话
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    if (streamTaskIdRef.current === task.id && streamOpenRef.current) void stopTask()
                    onDeleteTask(task.id)
                    setTaskMenuOpen(false)
                  }}
                >
                  <Trash2 size={13} /> 删除任务
                </button>
              </div>
            )}
          </div>
          <button className="icon-button" aria-label="打开审阅面板" type="button" onClick={onOpenReview}><PanelRightOpen size={16} /></button>
        </div>
      </header>

      <div className="message-scroll">
        {task.messages.length === 0 && !task.liveMessage && !task.liveThought && liveEvents.length === 0 && task.planSteps.length === 0 && (
          <div className="empty-conversation">
            <Bot size={22} />
            <strong>还没有消息</strong>
            <span>
              {backend.mode === 'native'
                ? !workspacePath
                  ? '请先选择工作区，随后会自动连接 Grok。也可输入 /help 查看命令。'
                  : connecting
                    ? '正在自动连接 Grok…'
                    : connected
                      ? '已连接 Grok，直接输入你的第一个任务。也可输入 /help 查看命令。'
                      : connectionError
                        ? `自动连接失败：${connectionError}`
                        : '正在准备连接 Grok…'
                : '桌面版打开后会自动连接 Grok。浏览器预览可先试用任务管理与 / 命令。'}
            </span>
          </div>
        )}

        <MessageList
          messages={task.messages}
          highlightIndex={highlightMessageIndex}
          onHighlightConsumed={onHighlightConsumed}
        />
        <ExecutionTimeline key={task.id} steps={task.planSteps} />

        {(task.liveMessage || task.liveThought || liveEvents.length > 0) && (
          <div className="agent-block live-response" aria-label="Grok 实时回复" role="region">
            <div className="agent-avatar"><Bot size={17} /></div>
            <div className="agent-content">
              <div className="agent-name">Grok <span>实时会话</span></div>
              {task.liveThought && (
                <LiveThoughtPanel text={task.liveThought} hasReply={Boolean(task.liveMessage.trim())} />
              )}
              <LiveToolEventsPanel
                tools={liveEvents.filter((event): event is LiveToolEvent => event.kind === 'tool')}
                hasReply={Boolean(task.liveMessage.trim())}
              />
              {liveEvents.map((event, index) => {
                if (event.kind !== 'plan') return null
                return (
                  <div className={`live-event ${event.kind}`} key={`plan-${index}`}>
                    <Activity size={13} />
                    <span>收到执行计划 · {event.entries.length} 项</span>
                  </div>
                )
              })}
              {task.liveMessage && (
                <StreamPlainView
                  source={task.liveMessage}
                  className="live-message"
                  showCursor={task.status === 'running'}
                />
              )}
            </div>
          </div>
        )}

        <ChangeSummary workspace={workspace} onOpenReview={onOpenReview} />
        {connectionError && <div className="connection-error" role="alert">{connectionError}</div>}
      </div>

      {permission && (
        <div className="permission-dock">
          <PermissionBanner
            permission={permission}
            queueLength={permissionQueue.length}
            onSelect={(option) => void respondPermission(option)}
          />
        </div>
      )}

      <div
        className={`context-usage context-usage-${contextLevel}`}
        role="meter"
        aria-label="当前对话上下文容量"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(contextPercent)}
        aria-valuetext={contextLabel}
        title={contextHint}
      >
        <div className="context-usage-head">
          <span className="context-usage-title">上下文</span>
          <span className="context-usage-label">{contextLabel}</span>
          <span className={`context-usage-source source-${contextUsage.source}`}>
            {contextUsage.source === 'agent' ? '实时' : '估算'}
          </span>
          {contextUsage.cost && (
            <span className="context-usage-cost">
              {contextUsage.cost.amount}
              {' '}
              {contextUsage.cost.currency}
            </span>
          )}
        </div>
        <div className="context-usage-meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, contextPercent)}%` }} />
        </div>
        <span className="context-usage-remain">
          剩余 {formatTokenCount(Math.max(0, contextUsage.size - contextUsage.used))}
        </span>
      </div>

      <div className="composer-dock">
        <form
          className={`composer ${dragOver ? 'drag-over' : ''}`}
          onSubmit={submit}
          onDragOver={onComposerDragOver}
          onDragLeave={onComposerDragLeave}
          onDrop={(event) => { void onComposerDrop(event) }}
          aria-label="任务输入区"
        >
          {dragOver && (
            <div className="composer-drop-hint" role="status">松开以附加文件或图片</div>
          )}
          {attachments.length > 0 && (
            <div className="attachment-row" aria-label="附件列表">
              {attachments.map((file, index) => {
                const removeAttachment = () => {
                  const next = attachments.filter((_, i) => i !== index)
                  setAttachments(next)
                  onTaskPatch(task.id, { attachments: next, updatedAt: Date.now() })
                }
                if (isDataImageAttachment(file) || isCachedDataUrlPath(file)) {
                  return (
                    <ComposerImageChip
                      key={`${attachmentLabel(file)}-${index}`}
                      file={file}
                      onRemove={removeAttachment}
                    />
                  )
                }
                return (
                  <button
                    key={`${attachmentLabel(file)}-${index}`}
                    type="button"
                    className="attachment-chip"
                    onClick={removeAttachment}
                    title={file}
                  >
                    <Paperclip size={11} />
                    {attachmentLabel(file)}
                    <X size={11} />
                  </button>
                )
              })}
            </div>
          )}
          {slashSuggestions.length > 0 && (
            <div className="slash-suggest" role="listbox" aria-label="斜杠命令建议">
              {slashSuggestions.map((item, index) => (
                <button
                  key={item.command}
                  type="button"
                  role="option"
                  aria-selected={index === Math.min(slashIndex, slashSuggestions.length - 1)}
                  className={`slash-suggest-item${index === Math.min(slashIndex, slashSuggestions.length - 1) ? ' active' : ''}`}
                  onMouseEnter={() => setSlashIndex(index)}
                  onClick={() => applySlashSuggestion(item.command)}
                >
                  <strong>{item.command}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={composerRef}
            aria-label="任务输入"
            value={input}
            onChange={(event) => {
              setSlashDismissed(false)
              setInput(event.target.value)
            }}
            onKeyDown={onComposerKeyDown}
            onPaste={(event) => { void onComposerPaste(event) }}
            placeholder="在这里输入任务，或输入 / 使用命令… Enter 发送"
          />
          <div className="composer-tools">
            <div className="composer-left">
              <button type="button" className="tool-button" aria-label="附加内容" onClick={() => void attachFiles()} title="附加文件、粘贴图片或打开命令">
                <Plus size={16} />
              </button>
              <div className="mode-menu-wrap">
                <button
                  type="button"
                  className={`mode-button ${modeOpen ? 'open' : ''}`}
                  aria-label="切换审批模式"
                  aria-expanded={modeOpen}
                  onClick={() => setModeOpen((open) => !open)}
                >
                  <ShieldCheck size={14} /> {modeLabel} <ChevronDown size={13} />
                </button>
                {modeOpen && (
                  <div className="mode-menu" role="menu" aria-label="审批模式选项">
                    <button type="button" role="menuitemradio" aria-checked={approvalMode === 'approve'} className={approvalMode === 'approve' ? 'active' : ''} onClick={() => { onApprovalMode('approve'); setModeOpen(false) }}>
                      审批模式
                      <small>关键操作前等待确认</small>
                    </button>
                    <button type="button" role="menuitemradio" aria-checked={approvalMode === 'observe'} className={approvalMode === 'observe' ? 'active' : ''} onClick={() => { onApprovalMode('observe'); setModeOpen(false) }}>
                      观察模式
                      <small>自动允许工具权限请求</small>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              className="send-button"
              aria-label="发送任务"
              type="submit"
              disabled={
                (!input.trim() && attachments.length === 0)
                || (task.status === 'running' && !input.trim().startsWith('/'))
              }
              title={
                task.status === 'running' && !input.trim().startsWith('/')
                  ? '任务执行中，请先停止（/stop）或等待完成'
                  : undefined
              }
            >
              <Play size={14} fill="currentColor" />
            </button>
          </div>
        </form>
        <div className="composer-hint">
          {approvalMode === 'approve'
            ? '审批模式下，Grok 的工具调用会等待你确认。支持粘贴与拖入附件。'
            : '观察模式下会自动允许权限请求。支持粘贴与拖入附件。'}
        </div>
      </div>

      {showReconnectToast && (
        <div className="toast-stack" aria-live="polite">
          <div className="toast reconnect-toast" role="status" aria-label="重连进度通知">
            <div className="toast-body">
              <strong>{reconnectToastMessage(reconnectAttempt)}</strong>
              <small>
                {reconnectAttempt > 5
                  ? (connectionError || '请检查网络或手动连接 Grok')
                  : connecting
                    ? '正在尝试连接…'
                    : `约 ${Math.round(reconnectDelayMs(reconnectAttempt) / 1000)} 秒后重试${connectionError ? ` · ${connectionError}` : ''}`}
              </small>
              <div className="toast-progress" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (Math.min(reconnectAttempt, 5) / 5) * 100)}%` }} />
              </div>
            </div>
            <div className="toast-actions">
              {reconnectAttempt <= 5 && (
                <button type="button" onClick={() => { setToastDismissed(false); void connect() }}>
                  立即重连
                </button>
              )}
              <button type="button" className="toast-dismiss" aria-label="关闭重连通知" onClick={() => setToastDismissed(true)}>
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
