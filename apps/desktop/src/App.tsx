import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteAccountCredential,
  ensureLegacyAccount,
  getBackendStatus,
  importAccountCredential,
  inspectAccountCredential,
  migrateKeyringCredential,
  selectWorkspace,
  type BackendStatus,
} from './lib/desktopBridge'
import {
  type ApprovalMode,
  type FontScale,
  type Task,
  type ThemeMode,
  applyAppearance,
  archiveAssistantReply,
  createTask,
  downloadTextFile,
  exportAllTasksFilename,
  exportAllTasksJson,
  exportAllTasksMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  importTasksSnapshot,
  listTasks,
  loadApprovalMode,
  loadAutoConnectOnDialogue,
  loadAutoReconnect,
  loadFontScale,
  loadPreferredModel,
  loadTaskSnapshot,
  loadTheme,
  loadWorkspaces,
  mergePlanIntoSteps,
  mergeToolIntoPlan,
  parseTaskExportPayload,
  rememberWorkspace,
  saveApprovalMode,
  saveAutoConnectOnDialogue,
  saveAutoReconnect,
  saveFontScale,
  savePreferredModel,
  saveTaskSnapshot,
  saveTheme,
  toggleTaskArchived,
  toggleTaskPinned,
  type GlobalSearchHit,
  type ImportTasksMode,
} from './lib/tasks'
import {
  type ExportHistoryEntry,
  type ExportHistoryKind,
  type LayoutWidths,
  type ShortcutId,
  type ShortcutMap,
  type WorkspaceProfile,
  bindingFromEvent,
  clampReviewWidth,
  clampSidebarWidth,
  clearExportHistory,
  eventMatchesShortcut,
  exportHistoryCanRedownload,
  exportHistoryMime,
  layoutGridTemplate,
  loadDesktopNotifications,
  loadExportHistory,
  loadLayoutWidths,
  loadShortcuts,
  loadWorkspaceProfile,
  pushExportHistory,
  resetShortcuts,
  saveDesktopNotifications,
  saveLayoutWidths,
  saveShortcuts,
  saveWorkspaceProfile,
  showDesktopNotification,
} from './lib/prefs'
import type { AccountsState, Account } from './lib/accounts'
import {
  createAccount,
  deleteAccount as libDeleteAccount,
  getCurrentAccount as libGetCurrentAccount,
  loadAccounts,
  registerLegacyAccount,
  switchAccount as libSwitchAccount,
  updateAccount,
  upsertAccount,
} from './lib/accounts'
import {
  type McpServerConfig,
  loadMcpServers,
  saveMcpServers,
} from './lib/mcp'
import {
  type BillingUsage,
  type WorkspaceData,
} from './lib/grokAcpClient'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { ResizeHandle } from './components/ResizeHandle'
import { ConversationPane } from './components/ConversationPane'
import { ReviewPane } from './components/ReviewPane'
import { Overlay } from './components/Overlay'
import type { OverlayPanel, TaskPatch } from './components/types'
import { mergeLiveEvent } from './components/chatHelpers'
import {
  shouldAutoCloseReview,
  shouldDefaultReviewOpen,
} from './lib/layoutBreakpoints'

export default function App() {
  const initial = useMemo(() => loadTaskSnapshot(), [])
  const [tasks, setTasks] = useState<Task[]>(initial.tasks)
  const [activeTaskId, setActiveTaskId] = useState(initial.activeTaskId)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>(() => loadExportHistory())
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(() => loadApprovalMode())
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [workspacePath, setWorkspacePath] = useState(() => localStorage.getItem('grok-forge-workspace') ?? '')
  const [workspaces, setWorkspaces] = useState<string[]>(() => loadWorkspaces())
  const [reviewOpen, setReviewOpen] = useState(() => (
    typeof window !== 'undefined' ? shouldDefaultReviewOpen(window.innerWidth) : true
  ))
  /** When true, auto layout will not override the user's review open/close choice. */
  const reviewUserToggledRef = useRef(false)
  const [connected, setConnected] = useState(false)
  const [overlay, setOverlay] = useState<OverlayPanel>('none')
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'overview' | 'general' | 'model' | 'shortcuts' | 'mcp' | 'profile' | 'data' | 'accounts' | null
  >(null)
  const [backend, setBackend] = useState<BackendStatus | null>(null)
  const [commandDraft, setCommandDraft] = useState('')
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => loadMcpServers())
  const [autoReconnect, setAutoReconnect] = useState(() => loadAutoReconnect())
  const [autoConnectOnDialogue, setAutoConnectOnDialogue] = useState(() => loadAutoConnectOnDialogue())
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [fontScale, setFontScale] = useState<FontScale>(() => loadFontScale())
  const [preferredModel, setPreferredModel] = useState(() => loadPreferredModel())
  const [desktopNotifications, setDesktopNotifications] = useState(() => loadDesktopNotifications())
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts())
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutId | null>(null)
  const [layout, setLayout] = useState<LayoutWidths>(() => loadLayoutWidths())
  const [profile, setProfile] = useState<WorkspaceProfile>(() => loadWorkspaceProfile())
  const [billing, setBilling] = useState<BillingUsage | null>(null)
  const [billingRefreshing, setBillingRefreshing] = useState(false)
  const [accounts, setAccounts] = useState<AccountsState>(() => loadAccounts())
  const currentAccount = useMemo(() => {
    return libGetCurrentAccount(accounts)
  }, [accounts])

  const accountSwitchingRef = useRef(false)
  const accountRollbackRef = useRef<string | null>(null)

  const waitForAccountDisconnect = useCallback(() => new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.removeEventListener('grok-forge-account-switch-ready', finish)
      resolve()
    }
    window.addEventListener('grok-forge-account-switch-ready', finish, { once: true })
    window.dispatchEvent(new CustomEvent('grok-forge-account-switch'))
    window.setTimeout(finish, 3_000)
  }), [])

  const switchAccount = useCallback(async (accountId: string) => {
    if (accountSwitchingRef.current || accountId === accounts.currentAccountId) return accountId === accounts.currentAccountId
    if (!accounts.accounts.some((account) => account.id === accountId)) return false
    const running = tasks.filter((task) => task.status === 'running')
    if (running.length > 0 && !window.confirm(`切换账号将中断 ${running.length} 个运行中任务，是否继续？`)) return false
    accountSwitchingRef.current = true
    try {
      accountRollbackRef.current = accounts.currentAccountId
      await waitForAccountDisconnect()
      if (!libSwitchAccount(accountId)) return false
      const target = accounts.accounts.find((account) => account.id === accountId)
      if (target?.renewal === 'refreshable') updateAccount(accountId, { authStatus: 'refreshing' })
      setAccounts(loadAccounts())
      setTasks((current) => {
        const active = current.find((task) => task.id === activeTaskId)
        if (!active || active.accountId === accountId) return current
        const existing = current.find((task) => task.accountId === accountId)
        if (existing) {
          setActiveTaskId(existing.id)
          return current
        }
        const task = createTask({ accountId })
        setActiveTaskId(task.id)
        return [task, ...current]
      })
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('grok-forge-account-connect')), 0)
      return true
    } finally {
      accountSwitchingRef.current = false
    }
  }, [accounts, activeTaskId, tasks, waitForAccountDisconnect])

  const addImportedAccount = useCallback(async (name: string, raw: string) => {
    let account = createAccount({ name, source: 'import' })
    const result = await importAccountCredential(account.id, raw)
    account = { ...account, renewal: result.renewal, authStatus: result.authStatus }
    accountRollbackRef.current = accounts.currentAccountId
    await waitForAccountDisconnect()
    upsertAccount(account, true)
    setAccounts(loadAccounts())
    const task = createTask({ accountId: account.id })
    setTasks((current) => [task, ...current])
    setActiveTaskId(task.id)
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('grok-forge-account-connect')), 0)
    return account
  }, [accounts.currentAccountId, waitForAccountDisconnect])

  const addBrowserAccount = useCallback(async (name: string) => {
    const account = createAccount({ name, source: 'browser-oidc', authStatus: 'relogin-required' })
    accountRollbackRef.current = accounts.currentAccountId
    await waitForAccountDisconnect()
    upsertAccount(account, true)
    setAccounts(loadAccounts())
    const task = createTask({ accountId: account.id })
    setTasks((current) => [task, ...current])
    setActiveTaskId(task.id)
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('grok-forge-oidc-login')), 0)
    return account
  }, [accounts.currentAccountId, waitForAccountDisconnect])

  const deleteAccount = useCallback(async (accountId: string) => {
    const account = accounts.accounts.find((item) => item.id === accountId)
    if (!account) return
    const related = tasks.filter((task) => task.accountId === accountId).length
    if (!window.confirm(`删除账号“${account.name}”？${related ? `\n${related} 个历史任务会保留并转为未归属。` : ''}`)) return
    const wasCurrent = accounts.currentAccountId === accountId
    if (wasCurrent) await waitForAccountDisconnect()
    await deleteAccountCredential(accountId)
    libDeleteAccount(accountId)
    const nextAccounts = loadAccounts()
    setTasks((current) => {
      const retained = current.map((task) => task.accountId === accountId
        ? { ...task, accountId: null, acpSessionId: undefined, sessionKey: task.id }
        : task)
      if (!wasCurrent || !nextAccounts.currentAccountId) return retained
      const fallback = retained.find((task) => task.accountId === nextAccounts.currentAccountId)
      if (fallback) {
        setActiveTaskId(fallback.id)
        return retained
      }
      const task = createTask({ accountId: nextAccounts.currentAccountId })
      setActiveTaskId(task.id)
      return [task, ...retained]
    })
    setAccounts(nextAccounts)
    if (wasCurrent && nextAccounts.currentAccountId) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('grok-forge-account-connect')), 0)
    }
  }, [accounts, tasks, waitForAccountDisconnect])

  const updateAccountAuthStatus = useCallback((accountId: string, authStatus: Account['authStatus']) => {
    updateAccount(accountId, { authStatus, lastUsedAt: Date.now() })
    setAccounts(loadAccounts())
    if (authStatus === 'valid' || authStatus === 'relogin-required') accountRollbackRef.current = null
    if (authStatus === 'valid') {
      void inspectAccountCredential(accountId).then((inspection) => {
        updateAccount(accountId, { renewal: inspection.renewal, authStatus: inspection.authStatus })
        setAccounts(loadAccounts())
      }).catch(() => undefined)
    }
  }, [])

  const handleAccountConnectionError = useCallback((accountId: string, _message: string, kind: 'technical' | 'network' | 'authentication') => {
    const rollbackId = accountRollbackRef.current
    if (kind !== 'technical' || !rollbackId || rollbackId === accountId) return
    accountRollbackRef.current = null
    void waitForAccountDisconnect().then(() => {
      if (libSwitchAccount(rollbackId)) {
        setAccounts(loadAccounts())
        setTasks((current) => {
          const previousTask = current.find((task) => task.accountId === rollbackId)
          if (previousTask) {
            setActiveTaskId(previousTask.id)
            return current
          }
          const task = createTask({ accountId: rollbackId })
          setActiveTaskId(task.id)
          return [task, ...current]
        })
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('grok-forge-account-connect')), 0)
      }
    })
  }, [waitForAccountDisconnect])

  const activeAccount = useMemo(() => currentAccount, [currentAccount])
  const [replayTaskId, setReplayTaskId] = useState<string | null>(null)
  const [highlightMessageIndex, setHighlightMessageIndex] = useState<number | null>(null)
  const refreshWorkspaceRef = useRef<() => void>(() => undefined)

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0]

  const selectTask = useCallback((taskId: string, messageIndex?: number) => {
    void (async () => {
      let target = tasks.find((task) => task.id === taskId)
      if (!target) return
      if (!target.accountId) {
        if (!accounts.currentAccountId) {
          window.alert('请先添加账号，再绑定此历史任务。')
          return
        }
        if (!window.confirm('此历史任务尚未归属账号，是否绑定到当前账号？')) return
        setTasks((current) => current.map((task) => task.id === taskId
          ? { ...task, accountId: accounts.currentAccountId, acpSessionId: undefined, sessionKey: task.id }
          : task))
        target = { ...target, accountId: accounts.currentAccountId, acpSessionId: undefined }
      }
      if (target.accountId && target.accountId !== accounts.currentAccountId) {
        const owner = accounts.accounts.find((account) => account.id === target?.accountId)
        if (!owner) {
          setTasks((current) => current.map((task) => task.id === taskId
            ? { ...task, accountId: null, acpSessionId: undefined, sessionKey: task.id }
            : task))
          window.alert('任务原账号已不存在，任务已转为未归属。')
          return
        }
        if (!window.confirm(`此任务属于账号“${owner.name}”，是否先切换账号？`)) return
        if (!await switchAccount(owner.id)) return
      }
      setActiveTaskId(taskId)
      setHighlightMessageIndex(typeof messageIndex === 'number' ? messageIndex : null)
    })()
  }, [accounts, switchAccount, tasks])

  const selectSearchHit = useCallback((hit: GlobalSearchHit) => {
    selectTask(
      hit.taskId,
      hit.kind === 'message' && typeof hit.messageIndex === 'number' ? hit.messageIndex : undefined,
    )
  }, [selectTask])

  const togglePinTask = useCallback((taskId: string) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId ? toggleTaskPinned(task) : task
    )))
  }, [])

  const toggleArchiveTask = useCallback((taskId: string) => {
    setTasks((current) => {
      const next = current.map((task) => (
        task.id === taskId ? toggleTaskArchived(task) : task
      ))
      const target = next.find((task) => task.id === taskId)
      if (target?.archived && taskId === activeTaskId) {
        const visible = listTasks(next, '', null, { includeArchived: false })
        const fallback = visible[0] ?? next.find((task) => !task.archived) ?? next[0]
        if (fallback) setActiveTaskId(fallback.id)
      }
      return next
    })
  }, [activeTaskId])

  const recordExport = useCallback((entry: {
    kind: ExportHistoryKind
    label: string
    filename: string
    content?: string
    mime?: string
  }) => {
    setExportHistory(pushExportHistory(entry))
  }, [])

  const clearExports = useCallback(() => {
    setExportHistory(clearExportHistory())
  }, [])

  const redownloadExport = useCallback((entry: ExportHistoryEntry) => {
    if (!exportHistoryCanRedownload(entry) || !entry.content) return
    downloadTextFile(entry.filename, entry.content, exportHistoryMime(entry.kind, entry.mime))
  }, [])

  // Debounce snapshot writes so token-level live patches do not thrash localStorage.
  // Keep a ref so unmount can flush the latest state without writing on every cleanup.
  const snapshotRef = useRef({ tasks, activeTaskId })
  snapshotRef.current = { tasks, activeTaskId }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveTaskSnapshot(snapshotRef.current)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tasks, activeTaskId])
  useEffect(() => () => {
    saveTaskSnapshot(snapshotRef.current)
  }, [])

  useEffect(() => {
    applyAppearance(theme, fontScale)
  }, [theme, fontScale])

  useEffect(() => {
    void getBackendStatus().then(setBackend).catch(() => undefined)
  }, [])

  useEffect(() => {
    void ensureLegacyAccount().then((legacy) => {
      if (!legacy.accountId || !legacy.credentialExists) return
      registerLegacyAccount(legacy.accountId)
      setAccounts(loadAccounts())
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    const account = currentAccount
    if (!account) return
    void (async () => {
      try {
        if (account.legacySecureTokenId && account.source !== 'legacy-global') {
          const migrated = await migrateKeyringCredential(account.id, account.legacySecureTokenId)
          updateAccount(account.id, {
            renewal: migrated.renewal,
            authStatus: migrated.authStatus,
            legacySecureTokenId: undefined,
          })
        }
        const inspection = await inspectAccountCredential(account.id)
        updateAccount(account.id, { renewal: inspection.renewal, authStatus: inspection.authStatus })
        setAccounts(loadAccounts())
      } catch {
        updateAccount(account.id, { authStatus: 'temporarily-unavailable' })
        setAccounts(loadAccounts())
      }
    })()
  }, [currentAccount?.id])

  // Auto-close the review pane on narrow viewports until the user explicitly toggles it.
  useEffect(() => {
    const onResize = () => {
      if (reviewUserToggledRef.current) return
      const wide = !shouldAutoCloseReview(window.innerWidth)
      setReviewOpen(wide)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const openReview = useCallback(() => {
    reviewUserToggledRef.current = true
    setReviewOpen(true)
  }, [])

  const closeReview = useCallback(() => {
    reviewUserToggledRef.current = true
    setReviewOpen(false)
  }, [])

  const createNewTask = useCallback(() => {
    const task = createTask({ accountId: accounts.currentAccountId })
    setTasks((current) => [task, ...current])
    setActiveTaskId(task.id)
    setHighlightMessageIndex(null)
    setSearch('')
  }, [accounts.currentAccountId])

  const changeTheme = useCallback((next: ThemeMode) => {
    setTheme(next)
    saveTheme(next)
  }, [])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (recordingShortcut) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') {
          setRecordingShortcut(null)
          return
        }
        const binding = bindingFromEvent(event)
        if (!binding) return
        setShortcuts((current) => {
          const next = { ...current, [recordingShortcut]: binding }
          saveShortcuts(next)
          return next
        })
        setRecordingShortcut(null)
        return
      }

      if (event.key === 'Escape') {
        setOverlay('none')
        return
      }
      if (eventMatchesShortcut(event, shortcuts.newTask)) {
        event.preventDefault()
        createNewTask()
        return
      }
      if (eventMatchesShortcut(event, shortcuts.openSettings)) {
        event.preventDefault()
        setSettingsInitialTab(null)
        setOverlay('settings')
        return
      }
      if (
        eventMatchesShortcut(event, shortcuts.openSearch)
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault()
        setOverlay('search')
        return
      }
      if (eventMatchesShortcut(event, shortcuts.togglePin)) {
        event.preventDefault()
        togglePinTask(activeTaskId)
        return
      }
      if (eventMatchesShortcut(event, shortcuts.toggleArchive)) {
        event.preventDefault()
        toggleArchiveTask(activeTaskId)
        return
      }
      if (eventMatchesShortcut(event, shortcuts.openReview)) {
        event.preventDefault()
        openReview()
        return
      }
      if (eventMatchesShortcut(event, shortcuts.toggleTheme)) {
        event.preventDefault()
        changeTheme(theme === 'dark' ? 'light' : 'dark')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeTaskId, createNewTask, recordingShortcut, shortcuts, theme, changeTheme, togglePinTask, toggleArchiveTask, openReview])

  const updateWorkspacePath = (path: string) => {
    setWorkspacePath(path)
    localStorage.setItem('grok-forge-workspace', path)
    setWorkspaces(rememberWorkspace(path))
  }

  const chooseWorkspace = async () => {
    const selected = await selectWorkspace(workspacePath || undefined)
    if (selected) updateWorkspacePath(selected)
  }

  const patchTask = useCallback((taskId: string, patch: TaskPatch) => {
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task

      if (patch.finalizeAssistant) {
        let next = archiveAssistantReply({
          ...task,
          planSteps: patch.planSteps ?? task.planSteps,
        })
        if (patch.appendMessage) {
          next = { ...next, messages: [...next.messages, patch.appendMessage] }
        }
        if (patch.status !== undefined) {
          next = { ...next, status: patch.status }
        }
        return { ...next, updatedAt: patch.updatedAt ?? Date.now() }
      }

      const messages = patch.appendMessage
        ? [...task.messages, patch.appendMessage]
        : patch.messages ?? task.messages

      let planSteps = patch.planSteps ?? task.planSteps
      if (patch.mergePlan !== undefined) {
        planSteps = mergePlanIntoSteps(planSteps, patch.mergePlan)
      }
      if (patch.mergeTool) {
        planSteps = mergeToolIntoPlan(planSteps, patch.mergeTool)
      }

      // Pure stream token patches should not reorder the sidebar or thrash its memo.
      const liveOnly = (
        (patch.appendLiveMessage !== undefined || patch.appendLiveThought !== undefined)
        && patch.appendMessage === undefined
        && patch.appendLiveEvent === undefined
        && patch.mergeTool === undefined
        && patch.mergePlan === undefined
        && patch.messages === undefined
        && patch.planSteps === undefined
        && patch.title === undefined
        && patch.tags === undefined
        && patch.attachments === undefined
        && patch.liveMessage === undefined
        && patch.liveThought === undefined
        && patch.liveEvents === undefined
        && patch.acpSessionId === undefined
      )

      const next: Task = {
        ...task,
        ...patch,
        messages,
        planSteps,
        liveMessage: patch.appendLiveMessage !== undefined
          ? task.liveMessage + patch.appendLiveMessage
          : patch.liveMessage !== undefined
            ? patch.liveMessage
            : task.liveMessage,
        liveThought: patch.appendLiveThought !== undefined
          ? task.liveThought + patch.appendLiveThought
          : patch.liveThought !== undefined
            ? patch.liveThought
            : task.liveThought,
        liveEvents: patch.appendLiveEvent !== undefined
          ? mergeLiveEvent(task.liveEvents, patch.appendLiveEvent)
          : patch.liveEvents !== undefined
            ? patch.liveEvents
            : task.liveEvents,
        updatedAt: patch.updatedAt !== undefined
          ? patch.updatedAt
          : liveOnly
            ? task.updatedAt
            : Date.now(),
      }
      delete (next as TaskPatch).appendLiveMessage
      delete (next as TaskPatch).appendLiveThought
      delete (next as TaskPatch).appendLiveEvent
      delete (next as TaskPatch).finalizeAssistant
      delete (next as TaskPatch).appendMessage
      delete (next as TaskPatch).mergeTool
      delete (next as TaskPatch).mergePlan
      return next
    }))
  }, [])

  const renameTask = (taskId: string, title: string) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId ? { ...task, title, updatedAt: Date.now() } : task
    )))
  }

  const clearTask = (taskId: string) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId
        ? {
            ...task,
            messages: [],
            liveMessage: '',
            liveThought: '',
            liveEvents: [],
            planSteps: [],
            attachments: [],
            tags: [],
            status: 'idle',
            title: '准备开始',
            updatedAt: Date.now(),
          }
        : task
    )))
  }

  const clearTaskSession = (taskId: string) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId
        ? {
            ...task,
            acpSessionId: undefined,
            messages: [...task.messages, { role: 'system' as const, content: '已清除 ACP 会话绑定，下次连接将创建新会话。' }],
            updatedAt: Date.now(),
          }
        : task
    )))
  }

  const forceNewSession = (taskId: string) => {
    setTasks((current) => current.map((task) => (
      task.id === taskId
        ? {
            ...task,
            acpSessionId: undefined,
            sessionKey: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            messages: [...task.messages, { role: 'system' as const, content: '已强制新会话密钥，请重新连接 Grok。' }],
            updatedAt: Date.now(),
          }
        : task
    )))
  }

  const deleteTask = (taskId: string) => {
    setTasks((current) => {
      const remaining = current.filter((task) => task.id !== taskId)
      const nextTasks = remaining.length > 0 ? remaining : [createTask({ accountId: accounts.currentAccountId })]
      const nextActive = nextTasks.find((task) => task.id === activeTaskId)?.id ?? nextTasks[0].id
      setActiveTaskId(nextActive)
      return nextTasks
    })
  }

  const clearAllTasks = () => {
    const task = createTask({ accountId: accounts.currentAccountId })
    setTasks([task])
    setActiveTaskId(task.id)
    setOverlay('none')
  }

  const changeApprovalMode = (mode: ApprovalMode) => {
    setApprovalMode(mode)
    saveApprovalMode(mode)
  }

  const changeMcpServers = (servers: McpServerConfig[]) => {
    setMcpServers(servers)
    saveMcpServers(servers)
  }

  const changeAutoReconnect = (enabled: boolean) => {
    setAutoReconnect(enabled)
    saveAutoReconnect(enabled)
  }

  const changeAutoConnectOnDialogue = (enabled: boolean) => {
    setAutoConnectOnDialogue(enabled)
    saveAutoConnectOnDialogue(enabled)
  }

  const changeFontScale = (next: FontScale) => {
    setFontScale(next)
    saveFontScale(next)
  }

  const changePreferredModel = (modelId: string) => {
    setPreferredModel(modelId)
    savePreferredModel(modelId)
  }

  const changeDesktopNotifications = (enabled: boolean) => {
    setDesktopNotifications(enabled)
    saveDesktopNotifications(enabled)
    if (enabled) {
      void showDesktopNotification('桌面通知已开启', '任务完成与审批请求时会提醒你。', true)
    }
  }

  const changeResetShortcuts = () => {
    const next = resetShortcuts()
    setShortcuts(next)
    setRecordingShortcut(null)
  }

  const resetLayout = () => {
    setLayout(saveLayoutWidths({ sidebar: 244, review: 420 }))
  }

  const changeProfile = (next: WorkspaceProfile) => {
    setProfile(saveWorkspaceProfile(next))
  }

  const exportAllJson = () => {
    const filename = exportAllTasksFilename('json')
    const content = exportAllTasksJson(tasks, activeTaskId)
    const mime = 'application/json;charset=utf-8'
    downloadTextFile(filename, content, mime)
    recordExport({ kind: 'tasks-json', label: `${tasks.length} 个任务`, filename, content, mime })
  }

  const exportAllMarkdown = () => {
    const filename = exportAllTasksFilename('md')
    const content = exportAllTasksMarkdown(tasks)
    const mime = 'text/markdown;charset=utf-8'
    downloadTextFile(filename, content, mime)
    recordExport({ kind: 'tasks-md', label: `${tasks.length} 个任务`, filename, content, mime })
  }

  const importTasksFromFile = (raw: string, mode: ImportTasksMode) => {
    const payload = parseTaskExportPayload(raw, new Set(accounts.accounts.map((account) => account.id)))
    const result = importTasksSnapshot(tasks, activeTaskId, payload, mode)
    setTasks(result.tasks)
    setActiveTaskId(result.activeTaskId)
    return { imported: result.imported, skipped: result.skipped }
  }

  // Drag only updates React state; localStorage is written on pointerup (see persistLayout).
  const onSidebarResize = useCallback((deltaX: number) => {
    setLayout((current) => ({
      ...current,
      sidebar: clampSidebarWidth(current.sidebar + deltaX),
    }))
  }, [])

  const onReviewResize = useCallback((deltaX: number) => {
    // Dragging the left edge of the review pane: moving right shrinks review.
    setLayout((current) => ({
      ...current,
      review: clampReviewWidth(current.review - deltaX),
    }))
  }, [])

  const persistLayout = useCallback(() => {
    setLayout((current) => saveLayoutWidths(current))
  }, [])

  // Expose refresh for review pane by loading from latest connected client via custom event.
  useEffect(() => {
    const onRefresh = () => window.dispatchEvent(new CustomEvent('grok-forge-refresh-workspace'))
    refreshWorkspaceRef.current = onRefresh
  }, [])

  /** Fallback after local git restore fails: ask Grok to revert remaining paths. */
  const requestRevert = (paths: string[]) => {
    if (paths.length === 0) return
    const list = paths.map((path) => `- ${path}`).join('\n')
    const prompt = paths.length === 1
      ? `请撤销工作区中对以下文件的改动，恢复到修改前状态：\n${list}`
      : `请撤销工作区中以下文件的全部未提交改动，恢复到修改前状态：\n${list}`
    patchTask(activeTask.id, {
      appendMessage: {
        role: 'system',
        content: connected
          ? '本地 git 未能完全还原，正在请 Grok 处理剩余文件…'
          : '本地 git 未能完全还原。请连接 Grok 后重试，或手动还原。',
      },
      updatedAt: Date.now(),
    })
    if (connected) {
      window.dispatchEvent(new CustomEvent('grok-forge-auto-send', { detail: prompt }))
    }
  }

  const confirmReviewed = (summary: string) => {
    patchTask(activeTask.id, {
      appendMessage: {
        role: 'system',
        content: summary || '已确认审阅当前改动（git add 暂存，未自动 commit）。',
      },
      updatedAt: Date.now(),
    })
  }

  return (
    <div
      className={`app-shell ${reviewOpen ? '' : 'review-closed'}`}
      style={{ gridTemplateColumns: layoutGridTemplate(layout, reviewOpen) }}
    >
      <WorkspaceSidebar
        workspacePath={workspacePath}
        workspaces={workspaces}
        connected={connected}
        backendVersion={backend?.version ?? ''}
        tasks={tasks}
        activeTaskId={activeTask.id}
        search={search}
        tagFilter={tagFilter}
        onSearch={setSearch}
        onTagFilter={setTagFilter}
        onSelectWorkspace={() => void chooseWorkspace()}
        onPickWorkspace={updateWorkspacePath}
        onNewTask={createNewTask}
        onSelectTask={selectTask}
        onRenameTask={renameTask}
        onClearTask={clearTask}
        onDeleteTask={deleteTask}
        onTogglePin={togglePinTask}
        onToggleArchive={toggleArchiveTask}
        showArchived={showArchived}
        onShowArchived={setShowArchived}
        onOpenSettings={() => {
          setSettingsInitialTab(null)
          setOverlay('settings')
        }}
        onOpenExtensions={() => setOverlay('extensions')}
        onOpenSessions={() => setOverlay('sessions')}
        onOpenSearch={() => setOverlay('search')}
        profile={profile}
        billing={billing}
        billingRefreshing={billingRefreshing}
        onRefreshBilling={() => {
          if (!connected) return
          window.dispatchEvent(new CustomEvent('grok-forge-refresh-billing'))
        }}
      />
      <ResizeHandle ariaLabel="调整侧边栏宽度" onDrag={onSidebarResize} onDragEnd={persistLayout} />
      <ConversationPane
        task={activeTask}
        accountId={accounts.currentAccountId}
        workspacePath={workspacePath}
        workspace={workspace}
        approvalMode={approvalMode}
        onApprovalMode={changeApprovalMode}
        onWorkspacePath={updateWorkspacePath}
        onWorkspaceData={setWorkspace}
        onOpenReview={openReview}
        onConnectionChange={(value) => {
          setConnected(value)
          if (!value) setBillingRefreshing(false)
        }}
        onBillingChange={setBilling}
        onBillingRefreshingChange={setBillingRefreshing}
        onTaskPatch={patchTask}
        onNewTask={createNewTask}
        onRenameTask={renameTask}
        onDeleteTask={deleteTask}
        onClearTask={clearTask}
        onOpenCommands={() => setOverlay('commands')}
        commandDraft={commandDraft}
        onCommandDraftConsumed={() => setCommandDraft('')}
        autoReconnect={autoReconnect}
        autoConnectOnDialogue={autoConnectOnDialogue}
        preferredModel={preferredModel}
        desktopNotifications={desktopNotifications}
        shortcuts={shortcuts}
        highlightMessageIndex={highlightMessageIndex}
        onHighlightConsumed={() => setHighlightMessageIndex(null)}
        onAccountAuthStatus={updateAccountAuthStatus}
        onAccountConnectionError={handleAccountConnectionError}
      />
      {reviewOpen && (
        <>
          <ResizeHandle ariaLabel="调整审阅面板宽度" onDrag={onReviewResize} onDragEnd={persistLayout} />
          <ReviewPane
            workspace={workspace}
            workspacePath={workspacePath}
            connected={connected}
            onClose={closeReview}
            onRequestRevert={requestRevert}
            onConfirmReviewed={confirmReviewed}
            onRefreshWorkspace={() => refreshWorkspaceRef.current()}
            onFileActionMessage={(message) => {
              patchTask(activeTask.id, {
                appendMessage: { role: 'system', content: message },
                updatedAt: Date.now(),
              })
            }}
            onRecordExport={recordExport}
          />
        </>
      )}
      {overlay !== 'none' && (
        <Overlay
          panel={overlay}
          backend={backend}
          workspacePath={workspacePath}
          workspace={workspace}
          connected={connected}
          approvalMode={approvalMode}
          autoReconnect={autoReconnect}
          autoConnectOnDialogue={autoConnectOnDialogue}
          theme={theme}
          fontScale={fontScale}
          preferredModel={preferredModel}
          desktopNotifications={desktopNotifications}
          shortcuts={shortcuts}
          recordingShortcut={recordingShortcut}
          taskCount={tasks.length}
          mcpServers={mcpServers}
          tasks={tasks}
          activeTaskId={activeTask.id}
          replayTaskId={replayTaskId}
          onMcpServers={changeMcpServers}
          onClose={() => {
            setOverlay('none')
            setSettingsInitialTab(null)
          }}
          onApprovalMode={changeApprovalMode}
          onAutoReconnect={changeAutoReconnect}
          onAutoConnectOnDialogue={changeAutoConnectOnDialogue}
          onTheme={changeTheme}
          onFontScale={changeFontScale}
          onPreferredModel={changePreferredModel}
          onDesktopNotifications={changeDesktopNotifications}
          onStartRecordShortcut={setRecordingShortcut}
          onResetShortcuts={changeResetShortcuts}
          onClearAllTasks={clearAllTasks}
          onPickCommand={(command) => {
            setCommandDraft(command)
            setOverlay('none')
          }}
          onSelectTask={selectTask}
          onSelectSearchHit={selectSearchHit}
          onClearTaskSession={clearTaskSession}
          onForceNewSession={forceNewSession}
          onReplayTask={setReplayTaskId}
          onExportReplay={(taskId) => {
            const task = tasks.find((item) => item.id === taskId)
            if (!task) return
            const filename = exportTaskReplayFilename(task)
            const content = exportTaskReplay(task)
            downloadTextFile(filename, content)
            recordExport({ kind: 'replay', label: task.title, filename, content })
          }}
          profile={profile}
          onProfile={changeProfile}
          onExportAllJson={exportAllJson}
          onExportAllMarkdown={exportAllMarkdown}
          onResetLayout={resetLayout}
          onImportTasks={importTasksFromFile}
          exportHistory={exportHistory}
          onClearExportHistory={clearExports}
          onRedownloadExport={redownloadExport}
          onRecordExport={recordExport}
          settingsInitialTab={settingsInitialTab}
          accounts={accounts}
          currentAccount={activeAccount}
          addImportedAccount={addImportedAccount}
          addBrowserAccount={addBrowserAccount}
          switchAccount={switchAccount}
          deleteAccount={deleteAccount}
          onOpenMcpSettings={() => {
            setSettingsInitialTab('mcp')
            setOverlay('settings')
          }}
        />
      )}
    </div>
  )
}
