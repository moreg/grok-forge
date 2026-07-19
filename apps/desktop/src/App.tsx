import { type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  FileCode2,
  FileDiff,
  FolderGit2,
  GitBranch,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquareTerminal,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import {
  getBackendStatus,
  gitRestoreFile,
  gitRestoreFiles,
  gitStageFiles,
  listenForTerminalChunks,
  listenForTerminalExit,
  readTextFile,
  selectFiles,
  selectWorkspace,
  terminalKill,
  terminalList,
  terminalOpenShell,
  terminalWrite,
  writeTextFile,
  type AcpUiEvent,
  type BackendStatus,
  type LocalTerminal,
  type PermissionOption,
} from './lib/desktopBridge'
import {
  applyHunkDecisionsToContent,
  applyHunkDecisionsToDiff,
  applyIgnoreWhitespace,
  buildAllHunkDecisions,
  buildFileDecisionChecklist,
  countDiffChanges,
  countHunkDecisions,
  foldUnchangedDiff,
  formatFileDecisionChecklist,
  highlightCodeLine,
  languageFromPath,
  patchExportFilename,
  pathsToStageOnConfirm,
  previewHunkDecisions,
  rejectHunkInContent,
  splitDiffIntoHunks,
  summarizeBatchApply,
  summarizeFileAction,
  summarizeFileDecisionChecklist,
  summarizeFoldedLines,
  summarizeHunkAction,
  summarizeMarkAllHunks,
  summarizePatchCopy,
  summarizePatchExport,
  summarizeReviewRestore,
  summarizeReviewStage,
  toMultiFilePatch,
  toSplitDiffRows,
  toUnifiedPatch,
  togglePinnedPath,
  workspaceFilesFingerprint,
  type DiffHunk,
  type DiffLine,
  type DiffViewBlock,
  type HighlightToken,
} from './lib/review'
/** 品牌图标：G 形锻环 + 紫色锻锤 + 火花，与应用图标同源 */
function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
      <path
        d="M724 262C666 208 590 176 506 176C318 176 168 326 168 512C168 698 318 848 506 848C646 848 766 766 820 652"
        stroke="currentColor"
        strokeWidth="108"
        strokeLinecap="round"
      />
      <path
        d="M512 496H848L726 618"
        stroke="#8B7DFF"
        strokeWidth="108"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M268 240l14 34 34 14-34 14-14 34-14-34-34-14 34-14z" fill="#8B7DFF" />
    </svg>
  )
}

import {
  type ApprovalMode,
  type ChatMessage,
  type FontScale,
  type PlanStep,
  type Task,
  type ThemeMode,
  MODEL_OPTIONS,
  SLASH_COMMANDS,
  applyAppearance,
  archiveAssistantReply,
  attachmentLabel,
  buildAttachmentPrompt,
  createTask,
  downloadTextFile,
  exportAllTasksFilename,
  exportAllTasksJson,
  exportAllTasksMarkdown,
  exportSearchHitsFilename,
  exportSearchHitsMarkdown,
  exportSessionReplaysFilename,
  exportSessionReplaysMarkdown,
  exportTaskStatsFilename,
  exportTaskStatsMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  collectTaskTags,
  countArchivedTasks,
  filterCommandPaletteTasks,
  filterSessionTasks,
  filterSlashCommands,
  fontScaleLabel,
  formatStepDuration,
  helpMessage,
  importTasksSnapshot,
  isDataImageAttachment,
  listTasks,
  loadApprovalMode,
  loadAutoReconnect,
  loadFontScale,
  loadPreferredModel,
  loadTaskSnapshot,
  loadTheme,
  loadWorkspaces,
  mergeToolIntoPlan,
  modelLabel,
  parsePlanEntries,
  parseTaskExportPayload,
  pickAllowOption,
  readAttachmentsFromDataTransfer,
  readImageAttachmentsFromDataTransfer,
  reconnectDelayMs,
  reconnectToastMessage,
  rememberWorkspace,
  saveApprovalMode,
  saveAutoReconnect,
  saveFontScale,
  savePreferredModel,
  saveTaskSnapshot,
  saveTheme,
  filterTasksByStatsRange,
  formatTaskStatsSummary,
  searchTasksGlobal,
  statusLabel,
  STATS_TIME_RANGE_OPTIONS,
  summarizeTaskStats,
  titleFromPrompt,
  toggleTaskArchived,
  toggleTaskPinned,
  toggleTaskTag,
  toResourceBlocks,
  type GlobalSearchHit,
  type ImportTasksMode,
  type StatsTimeRange,
} from './lib/tasks'
import {
  type ExportHistoryEntry,
  type ExportHistoryKind,
  type LayoutWidths,
  type ShortcutId,
  type ShortcutMap,
  type WorkspaceProfile,
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  clampReviewWidth,
  clampSidebarWidth,
  clearExportHistory,
  eventMatchesShortcut,
  bindingFromEvent,
  exportHistoryCanRedownload,
  exportHistoryKindLabel,
  exportHistoryMime,
  formatBillingNextRefreshLabel,
  formatBillingRefreshLabel,
  formatPeriodEndAbsolute,
  formatPeriodRemainingLabel,
  formatExportHistoryTime,
  formatUsageLabel,
  layoutGridTemplate,
  loadDesktopNotifications,
  loadExportHistory,
  loadLayoutWidths,
  loadShortcuts,
  loadWorkspaceProfile,
  periodLabelFromType,
  profileInitials,
  pushExportHistory,
  resetShortcuts,
  saveDesktopNotifications,
  saveLayoutWidths,
  saveShortcuts,
  saveWorkspaceProfile,
  showDesktopNotification,
} from './lib/prefs'
import {
  type McpServerConfig,
  createEmptyMcpServer,
  formatArgsInput,
  formatEnvInput,
  loadMcpServers,
  parseArgsInput,
  parseEnvInput,
  saveMcpServers,
} from './lib/mcp'
import {
  BILLING_POLL_INTERVAL_MS,
  GrokAcpClient,
  type BillingUsage,
  type WorkspaceData,
} from './lib/grokAcpClient'
import { MarkdownView } from './lib/MarkdownView'

type ReviewFile = {
  shortName: string
  path: string
  additions: number
  deletions: number
  diff: Array<{ type: 'same' | 'add' | 'remove'; old: string; next: string; value: string }>
}

type TaskPatch = Partial<Task> & {
  appendLiveMessage?: string
  appendLiveThought?: string
  appendLiveEvent?: AcpUiEvent
  finalizeAssistant?: boolean
  appendMessage?: ChatMessage
  mergeTool?: Extract<AcpUiEvent, { kind: 'tool' }>
}

type OverlayPanel = 'none' | 'settings' | 'extensions' | 'commands' | 'sessions' | 'search'

function HighlightedCode({ text, language }: { text: string; language: string }) {
  const tokens = useMemo(() => highlightCodeLine(text, language), [text, language])
  return (
    <code>
      {tokens.map((token: HighlightToken, index) => (
        <span key={`${token.kind}-${index}`} className={`tok-${token.kind}`}>{token.text}</span>
      ))}
    </code>
  )
}

type PendingPermission = Extract<AcpUiEvent, { kind: 'permission' }>

function asEvents(value: unknown[]): AcpUiEvent[] {
  return value.filter((entry): entry is AcpUiEvent => {
    if (entry === null || typeof entry !== 'object') return false
    const kind = (entry as { kind?: unknown }).kind
    // Only tool/plan rows are rendered in the live event list.
    // Thought/message stream into liveThought/liveMessage instead.
    return kind === 'tool' || kind === 'plan'
  })
}

/** Merge tool updates by toolCallId (and replace the latest plan) so the live list does not grow unbounded. */
function mergeLiveEvent(events: unknown[], event: AcpUiEvent): unknown[] {
  if (event.kind === 'tool' && event.toolCallId) {
    const index = events.findIndex((entry) => {
      if (entry === null || typeof entry !== 'object') return false
      const row = entry as { kind?: unknown; toolCallId?: unknown }
      return row.kind === 'tool' && row.toolCallId === event.toolCallId
    })
    if (index >= 0) {
      const next = events.slice()
      next[index] = event
      return next
    }
  }
  if (event.kind === 'plan') {
    const index = events.findIndex((entry) => {
      if (entry === null || typeof entry !== 'object') return false
      return (entry as { kind?: unknown }).kind === 'plan'
    })
    if (index >= 0) {
      const next = events.slice()
      next[index] = event
      return next
    }
  }
  return [...events, event]
}

function thoughtPreview(text: string, max = 72): string {
  const flat = text.trim().replace(/\s+/g, ' ')
  if (flat.length <= max) return flat
  return `${flat.slice(0, max)}…`
}

/** Collapsible agent-thought stream: auto-folds when the reply starts so the answer stays in focus. */
function LiveThoughtPanel({ text, hasReply }: { text: string; hasReply: boolean }) {
  const [open, setOpen] = useState(!hasReply)
  const manualRef = useRef(false)
  const wasEmptyRef = useRef(true)

  useEffect(() => {
    if (!text.trim()) {
      wasEmptyRef.current = true
      manualRef.current = false
      setOpen(true)
      return
    }
    if (wasEmptyRef.current) {
      wasEmptyRef.current = false
      manualRef.current = false
      setOpen(!hasReply)
    }
  }, [text, hasReply])

  useEffect(() => {
    if (hasReply && !manualRef.current) setOpen(false)
  }, [hasReply])

  const toggle = () => {
    manualRef.current = true
    setOpen((value) => !value)
  }

  return (
    <div className={`live-thought ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Grok 思考中">
      <button
        type="button"
        className="live-thought-toggle"
        aria-expanded={open}
        aria-label={open ? '折叠思考过程' : '展开思考过程'}
        onClick={toggle}
      >
        <Sparkles size={13} />
        <span className="live-thought-label">思考过程</span>
        {!open && (
          <em className="live-thought-preview">{thoughtPreview(text)}</em>
        )}
        {open ? <ChevronDown size={13} className="live-thought-chevron" /> : <ChevronRight size={13} className="live-thought-chevron" />}
      </button>
      {open && (
        <div className="live-thought-body">
          <MarkdownView source={text} className="live-thought-text md-thought" />
        </div>
      )}
    </div>
  )
}

function WorkspaceSidebar({
  workspacePath,
  workspaces,
  connected,
  backendVersion,
  tasks,
  activeTaskId,
  search,
  tagFilter,
  onSearch,
  onTagFilter,
  onSelectWorkspace,
  onPickWorkspace,
  onNewTask,
  onSelectTask,
  onRenameTask,
  onClearTask,
  onDeleteTask,
  onTogglePin,
  onToggleArchive,
  showArchived,
  onShowArchived,
  onOpenSettings,
  onOpenExtensions,
  onOpenSessions,
  onOpenSearch,
  profile,
  billing = null,
  billingRefreshing = false,
  onRefreshBilling,
}: {
  workspacePath: string
  workspaces: string[]
  connected: boolean
  backendVersion: string
  tasks: Task[]
  activeTaskId: string
  search: string
  tagFilter: string | null
  onSearch: (value: string) => void
  onTagFilter: (tag: string | null) => void
  onSelectWorkspace: () => void
  onPickWorkspace: (path: string) => void
  onNewTask: () => void
  onSelectTask: (taskId: string, messageIndex?: number) => void
  onRenameTask: (taskId: string, title: string) => void
  onClearTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onTogglePin: (taskId: string) => void
  onToggleArchive: (taskId: string) => void
  showArchived: boolean
  onShowArchived: (value: boolean) => void
  onOpenSettings: () => void
  onOpenExtensions: () => void
  onOpenSessions: () => void
  onOpenSearch: () => void
  profile: WorkspaceProfile
  /** Live coding-credit usage from `x.ai/billing` when connected. */
  billing?: BillingUsage | null
  billingRefreshing?: boolean
  onRefreshBilling?: () => void
}) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (!billing?.refreshedAt) return
    const timer = window.setInterval(() => setNowTick(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [billing?.refreshedAt])
  const workspaceName = workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? '选择工作区'
  const allTags = useMemo(() => collectTaskTags(tasks), [tasks])
  const archivedCount = useMemo(() => countArchivedTasks(tasks), [tasks])
  const sorted = listTasks(tasks, search, tagFilter, { includeArchived: showArchived })
  const recent = workspaces.filter((path) => path !== workspacePath).slice(0, 5)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [conversationsCollapsed, setConversationsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('grok-forge-conversations-collapsed') === '1'
    } catch {
      return false
    }
  })

  const toggleConversationsCollapsed = () => {
    setConversationsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('grok-forge-conversations-collapsed', next ? '1' : '0')
      } catch {
        // ignore quota / private mode
      }
      return next
    })
  }

  useEffect(() => {
    if (!menuTaskId) return
    const close = () => setMenuTaskId(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menuTaskId])

  const openTaskMenu = (event: MouseEvent, taskId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuTaskId(taskId)
    setMenuPos({ x: event.clientX, y: event.clientY })
  }

  const commitSidebarRename = (taskId: string) => {
    const next = renameDraft.trim()
    if (next) onRenameTask(taskId, next)
    setRenamingId(null)
    setRenameDraft('')
  }

  return (
    <aside className="sidebar" aria-label="工作区" role="navigation">
      <div className="brand-row">
        <div className="brand-mark"><Sparkles size={17} /></div>
        <span>Grok Forge</span>
        <button className="icon-button sidebar-menu" aria-label="菜单" type="button" onClick={onOpenSettings}>
          <Menu size={17} />
        </button>
      </div>

      <button className="new-task" type="button" onClick={onNewTask} aria-label="新建任务">
        <MessageSquarePlus size={16} /> 新建任务 <span>⌘ N</span>
      </button>

      <div className="search-box">
        <Search size={14} />
        <input aria-label="搜索任务" placeholder="搜索任务…" value={search} onChange={(event) => onSearch(event.target.value)} />
      </div>

      <div className="sidebar-section">
        <div className="section-label">
          工作区
          <button aria-label="添加工作区" type="button" onClick={onSelectWorkspace}><Plus size={14} /></button>
        </div>
        <div className="workspace-card-row active">
          <button className="workspace-card" aria-label="选择工作区" type="button" onClick={onSelectWorkspace}>
            <div className="workspace-icon"><FolderGit2 size={16} /></div>
            <div>
              <strong>{workspaceName}</strong>
              <small>{workspacePath || '尚未选择工作区'}</small>
            </div>
          </button>
          <button
            type="button"
            className="workspace-collapse"
            aria-label={conversationsCollapsed ? '展开最近任务' : '收起最近任务'}
            aria-expanded={!conversationsCollapsed}
            title={conversationsCollapsed ? '展开最近任务' : '收起最近任务'}
            onClick={toggleConversationsCollapsed}
          >
            {conversationsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        {recent.map((path) => {
          const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
          return (
            <button
              key={path}
              type="button"
              className="workspace-card"
              aria-label={`切换工作区 ${name}`}
              onClick={() => onPickWorkspace(path)}
            >
              <div className="workspace-icon"><FolderGit2 size={16} /></div>
              <div>
                <strong>{name}</strong>
                <small>{path}</small>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`sidebar-section conversations ${conversationsCollapsed ? 'is-collapsed' : ''}`}>
        <div className="section-label">
          最近任务
          <div className="section-label-actions">
            <button type="button" aria-label="打开全局搜索" onClick={onOpenSearch} title="全局搜索">
              <Search size={14} />
            </button>
            <button
              type="button"
              className="workspace-collapse section-collapse"
              aria-label={conversationsCollapsed ? '展开最近任务' : '收起最近任务'}
              aria-expanded={!conversationsCollapsed}
              title={conversationsCollapsed ? '展开最近任务' : '收起最近任务'}
              onClick={toggleConversationsCollapsed}
            >
              {conversationsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
        {!conversationsCollapsed && (
          <>
            <div className="sidebar-stats" aria-label="任务统计摘要">
              {formatTaskStatsSummary(summarizeTaskStats(tasks))}
            </div>
            {allTags.length > 0 && (
              <div className="tag-filter" aria-label="标签分组">
                <button
                  type="button"
                  className={!tagFilter ? 'active' : ''}
                  aria-pressed={!tagFilter}
                  onClick={() => onTagFilter(null)}
                >
                  全部
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={tagFilter === tag ? 'active' : ''}
                    aria-pressed={tagFilter === tag}
                    aria-label={`筛选标签 ${tag}`}
                    onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
            {archivedCount > 0 && (
              <div className="archive-toggle-row">
                <button
                  type="button"
                  className={showArchived ? 'active' : ''}
                  aria-pressed={showArchived}
                  aria-label={showArchived ? '隐藏已归档任务' : '显示已归档任务'}
                  onClick={() => onShowArchived(!showArchived)}
                >
                  {showArchived ? '隐藏归档' : `显示归档 (${archivedCount})`}
                </button>
              </div>
            )}
            {sorted.length === 0 ? (
              <div className="empty-conversations">暂无匹配任务</div>
            ) : (
              sorted.map((task) => (
                <div key={task.id} className={`conversation-wrap ${task.pinned ? 'pinned' : ''} ${task.archived ? 'archived' : ''}`}>
                  {renamingId === task.id ? (
                    <form
                      className="conversation-rename"
                      onSubmit={(event) => {
                        event.preventDefault()
                        commitSidebarRename(task.id)
                      }}
                    >
                      <input
                        aria-label={`重命名任务 ${task.title}`}
                        value={renameDraft}
                        autoFocus
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => commitSidebarRename(task.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setRenamingId(null)
                            setRenameDraft('')
                          }
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className={`conversation ${task.id === activeTaskId ? 'active' : ''}`}
                      aria-label={`切换到任务 ${task.title}`}
                      aria-current={task.id === activeTaskId ? 'true' : undefined}
                      onClick={() => onSelectTask(task.id)}
                      onContextMenu={(event) => openTaskMenu(event, task.id)}
                    >
                      <span className="conversation-title">
                        {task.pinned && <Star size={11} className="pin-badge" aria-hidden="true" />}
                        {task.title}
                      </span>
                      <small>
                        <CircleDot size={9} />
                        {statusLabel(task.status)}
                        {task.messages.length > 0 ? ` · ${task.messages.length} 条消息` : ''}
                        {task.pinned ? ' · 置顶' : ''}
                        {task.archived ? ' · 已归档' : ''}
                      </small>
                      {(task.tags?.length ?? 0) > 0 && (
                        <span className="task-tags">
                          {task.tags!.slice(0, 3).map((tag) => (
                            <em key={tag}>#{tag}</em>
                          ))}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="conversation-actions">
                    <button
                      type="button"
                      className={`conversation-pin ${task.pinned ? 'active' : ''}`}
                      aria-label={task.pinned ? `取消置顶 ${task.title}` : `置顶 ${task.title}`}
                      aria-pressed={Boolean(task.pinned)}
                      onClick={(event) => {
                        event.stopPropagation()
                        onTogglePin(task.id)
                      }}
                    >
                      <Star size={13} fill={task.pinned ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="conversation-more"
                      aria-label={`任务菜单 ${task.title}`}
                      onClick={(event) => openTaskMenu(event, task.id)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
        {menuTaskId && (
          <div
            className="task-context-menu"
            role="menu"
            aria-label="任务右键菜单"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSelectTask(menuTaskId)
                setMenuTaskId(null)
              }}
            >
              打开任务
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const task = tasks.find((item) => item.id === menuTaskId)
                setRenamingId(menuTaskId)
                setRenameDraft(task?.title ?? '')
                setMenuTaskId(null)
              }}
            >
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTogglePin(menuTaskId)
                setMenuTaskId(null)
              }}
            >
              {tasks.find((item) => item.id === menuTaskId)?.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleArchive(menuTaskId)
                setMenuTaskId(null)
              }}
            >
              {tasks.find((item) => item.id === menuTaskId)?.archived ? '取消归档' : '归档'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClearTask(menuTaskId)
                setMenuTaskId(null)
              }}
            >
              清空对话
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                onDeleteTask(menuTaskId)
                setMenuTaskId(null)
              }}
            >
              删除任务
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" onClick={onOpenSearch} aria-label="全局搜索"><Search size={16} /> 搜索</button>
        <button type="button" onClick={onOpenSessions} aria-label="会话列表"><MessageSquarePlus size={16} /> 会话</button>
        <button type="button" onClick={onOpenExtensions} aria-label="扩展中心"><LayoutGrid size={16} /> 扩展中心</button>
        <button type="button" onClick={onOpenSettings} aria-label="设置"><Settings size={16} /> 设置</button>
        {(() => {
          const usagePercent = billing
            ? Math.min(100, Math.max(0, billing.usagePercent))
            : Math.min(100, Math.max(0, profile.usagePercent))
          const periodLabel = billing
            ? periodLabelFromType(billing.periodType)
            : '本月额度'
          const usageLabel = formatUsageLabel(usagePercent, periodLabel)
          const planLabel = billing?.tier?.trim() || profile.plan
          const periodRemain = billing?.periodEnd
            ? formatPeriodRemainingLabel(billing.periodEnd, nowTick)
            : ''
          const periodEndAbs = billing?.periodEnd
            ? formatPeriodEndAbsolute(billing.periodEnd)
            : ''
          const periodTitle = periodEndAbs
            ? `本周期额度将于 ${periodEndAbs} 重置`
            : periodRemain
              ? '本周期额度重置倒计时'
              : ''
          const refreshedAt = billing?.refreshedAt
          const refreshLabel = refreshedAt
            ? formatBillingRefreshLabel(refreshedAt, nowTick)
            : ''
          const nextLabel = refreshedAt
            ? formatBillingNextRefreshLabel(refreshedAt, BILLING_POLL_INTERVAL_MS, nowTick)
            : ''
          const refreshTitle = [
            periodTitle,
            refreshLabel ? `用量数据${refreshLabel}` : '',
            nextLabel ? `自动轮询：${nextLabel}` : '',
            onRefreshBilling ? '点击立即拉取最新用量' : '',
          ].filter(Boolean).join('\n')
          const meterLabel = periodRemain ? `${usageLabel} · ${periodRemain}` : usageLabel
          return (
            <div className="profile" aria-label="工作区资料">
              <div className="avatar" aria-hidden="true">{profileInitials(profile.displayName)}</div>
              <div className="profile-meta">
                <strong>{profile.displayName}</strong>
                <small>
                  <span className="plan-badge">{planLabel}</span>
                  {connected ? ' · 已连接' : ` · ${backendVersion || '未连接'}`}
                </small>
                <div className="usage-meter" aria-label={meterLabel} title={periodTitle || undefined}>
                  <span style={{ width: `${usagePercent}%` }} />
                </div>
                <em className="usage-label" title={periodTitle || undefined}>
                  {usageLabel}
                  {periodRemain ? (
                    <span className="usage-period-remain" aria-label={`额度重置倒计时 ${periodRemain}`}>
                      {' · '}{periodRemain}
                    </span>
                  ) : null}
                  {billing ? <span className="usage-live"> · 实时</span> : null}
                </em>
                {billing?.prepaidBalanceCents != null && billing.prepaidBalanceCents > 0 && (
                  <em className="usage-label prepaid">
                    余额 ${(billing.prepaidBalanceCents / 100).toFixed(billing.prepaidBalanceCents % 100 === 0 ? 0 : 2)}
                  </em>
                )}
                {billing && (refreshLabel || onRefreshBilling) && (
                  onRefreshBilling ? (
                    <button
                      type="button"
                      className={`usage-refresh${billingRefreshing ? ' is-refreshing' : ''}`}
                      aria-label={billingRefreshing ? '正在更新用量' : '更新用量数据'}
                      title={refreshTitle || '更新用量数据'}
                      disabled={billingRefreshing || !connected}
                      onClick={() => onRefreshBilling()}
                    >
                      {billingRefreshing
                        ? '更新中…'
                        : refreshLabel
                          ? `${refreshLabel}${nextLabel ? ` · ${nextLabel}` : ''}`
                          : '更新用量'}
                    </button>
                  ) : (
                    <em className="usage-label refresh-hint" title={refreshTitle}>
                      {refreshLabel}
                      {nextLabel ? ` · ${nextLabel}` : ''}
                    </em>
                  )
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </aside>
  )
}

function ResizeHandle({
  ariaLabel,
  onDrag,
}: {
  ariaLabel: string
  onDrag: (deltaX: number) => void
}) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      const delta = event.clientX - lastX.current
      lastX.current = event.clientX
      if (delta !== 0) onDrag(delta)
    }
    const onUp = () => {
      dragging.current = false
      document.body.classList.remove('resizing-panels')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onDrag])

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault()
        dragging.current = true
        lastX.current = event.clientX
        document.body.classList.add('resizing-panels')
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onDrag(-12)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          onDrag(12)
        }
      }}
    />
  )
}

function ExecutionTimeline({ steps }: { steps: PlanStep[] }) {
  const doneCount = steps.filter((step) => step.status === 'completed').length
  const failedCount = steps.filter((step) => step.status === 'failed').length
  const running = steps.some((step) => step.status === 'in_progress')
  const finished = steps.length > 0
    && !running
    && steps.every((step) => step.status === 'completed' || step.status === 'failed')

  // Running/pending → open; fully finished history → collapsed until the user expands.
  const [open, setOpen] = useState(() => !finished)
  const manualRef = useRef(false)
  const sawRunningRef = useRef(running)

  useEffect(() => {
    if (steps.length === 0) return
    if (running) {
      sawRunningRef.current = true
      // New activity: expand unless the user explicitly collapsed.
      if (!manualRef.current) setOpen(true)
      return
    }
    // After a run finishes, auto-collapse so long tool lists don't flood the chat.
    if (finished && !manualRef.current) {
      setOpen(false)
    }
  }, [running, finished, steps.length])

  if (steps.length === 0) return null

  const toggle = () => {
    manualRef.current = true
    setOpen((value) => !value)
  }

  const lastStep = steps[steps.length - 1]
  const preview = running
    ? (lastStep?.content || '执行中…')
    : failedCount > 0
      ? `${doneCount}/${steps.length} 已完成 · ${failedCount} 失败`
      : `${doneCount}/${steps.length} 已完成`

  return (
    <div
      className={`timeline-card ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label="执行时间线"
      role="region"
    >
      <button
        type="button"
        className="timeline-heading"
        aria-expanded={open}
        aria-label={open ? '折叠执行过程' : '展开执行过程'}
        onClick={toggle}
      >
        <Activity size={13} />
        <span className="timeline-heading-label">执行过程</span>
        {!open && <em className="timeline-preview">{preview}</em>}
        <span className="timeline-heading-count">{doneCount}/{steps.length} 已完成</span>
        {open
          ? <ChevronDown size={13} className="timeline-chevron" />
          : <ChevronRight size={13} className="timeline-chevron" />}
      </button>
      {open && steps.map((step, index) => {
        const className = step.status === 'completed'
          ? 'done'
          : step.status === 'in_progress'
            ? 'running'
            : step.status === 'failed'
              ? 'failed'
              : ''
        const duration = formatStepDuration(step)
        return (
          <div className={`timeline-step ${className}`} key={`${step.toolCallId ?? step.content}-${index}`}>
            <div className="step-rail">
              <div className="step-icon">
                {step.status === 'completed' ? <Check size={11} /> : step.status === 'in_progress' ? <Play size={10} /> : step.status === 'failed' ? <X size={11} /> : <CircleDot size={10} />}
              </div>
              {index < steps.length - 1 && <div className="step-line" />}
            </div>
            <div className="step-copy">
              <strong>{step.content}</strong>
              {step.detail && <small>{step.detail}</small>}
            </div>
            {step.status === 'in_progress' ? (
              <div className="running-pill"><span />执行中</div>
            ) : duration ? (
              <div className="running-pill muted">{duration}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ChangeSummary({ workspace, onOpenReview }: { workspace: WorkspaceData | null; onOpenReview: () => void }) {
  if (!workspace || workspace.files.length === 0) return null
  const additions = workspace.files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = workspace.files.reduce((sum, file) => sum + file.deletions, 0)

  return (
    <button className="result-summary" type="button" onClick={onOpenReview} aria-label="查看改动摘要">
      <FileDiff size={13} />
      <strong>改动摘要</strong>
      <span>{workspace.files.length} 个文件</span>
      <em>+{additions}</em>
      <del>−{deletions}</del>
      <ChevronRight size={13} />
    </button>
  )
}

function MessageAttachments({ attachments }: { attachments?: string[] }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="message-attachments" aria-label="消息附件">
      {attachments.map((file, index) => {
        if (isDataImageAttachment(file)) {
          return (
            <a
              key={`img-${index}`}
              className="message-image-link"
              href={file}
              target="_blank"
              rel="noreferrer noopener"
              title="在新标签页打开图片"
            >
              <img src={file} alt={attachmentLabel(file)} className="message-image" />
            </a>
          )
        }
        return (
          <span key={`file-${index}`} className="message-file-chip" title={file}>
            <Paperclip size={12} />
            {attachmentLabel(file)}
          </span>
        )
      })}
    </div>
  )
}

function MessageList({
  messages,
  highlightIndex = null,
  onHighlightConsumed,
}: {
  messages: ChatMessage[]
  highlightIndex?: number | null
  onHighlightConsumed?: () => void
}) {
  useEffect(() => {
    if (highlightIndex == null || highlightIndex < 0 || highlightIndex >= messages.length) return
    const el = document.getElementById(`chat-msg-${highlightIndex}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = window.setTimeout(() => onHighlightConsumed?.(), 2_400)
    return () => window.clearTimeout(timer)
  }, [highlightIndex, messages.length, onHighlightConsumed])

  return (
    <>
      {messages.map((message, index) => {
        const highlighted = highlightIndex === index
        if (message.role === 'user') {
          return (
            <div
              className={`user-message${highlighted ? ' message-highlight' : ''}`}
              id={`chat-msg-${index}`}
              data-message-index={index}
              key={`${message.role}-${index}`}
            >
              {message.content.trim() ? (
                <MarkdownView source={message.content} className="md-user" />
              ) : null}
              <MessageAttachments attachments={message.attachments} />
            </div>
          )
        }
        return (
          <div
            className={`agent-block history-message ${message.role}${highlighted ? ' message-highlight' : ''}`}
            id={`chat-msg-${index}`}
            data-message-index={index}
            key={`${message.role}-${index}`}
            aria-label={message.role === 'system' ? '系统消息' : 'Grok 回复'}
          >
            <div className="agent-avatar"><Bot size={17} /></div>
            <div className="agent-content">
              <div className="agent-name">{message.role === 'system' ? '系统' : 'Grok'} <span>{message.role === 'system' ? '命令' : '回复'}</span></div>
              <MarkdownView
                source={message.content}
                className={message.role === 'system' ? 'md-system live-message' : 'md-agent live-message'}
              />
              <MessageAttachments attachments={message.attachments} />
            </div>
          </div>
        )
      })}
    </>
  )
}

function PermissionBanner({
  permission,
  queueLength = 1,
  onSelect,
}: {
  permission: PendingPermission
  /** Total pending permission requests including the one shown. */
  queueLength?: number
  onSelect: (option: PermissionOption) => void
}) {
  return (
    <div className="permission-card" role="alertdialog" aria-label="权限审批">
      <div>
        <strong>需要你的审批{queueLength > 1 ? `（${queueLength}）` : ''}</strong>
        <p>{permission.title}</p>
        {permission.toolCallId && <small>工具 ID：{permission.toolCallId}</small>}
        {queueLength > 1 && <small>处理完后还有 {queueLength - 1} 个待审批</small>}
      </div>
      <div className="permission-actions">
        {permission.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={option.kind.startsWith('reject') ? 'reject-button' : 'apply-button'}
            onClick={() => onSelect(option)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function ConversationPane({
  task,
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
}: {
  task: Task
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
  onOpenCommands: () => void
  commandDraft: string
  onCommandDraftConsumed: () => void
  autoReconnect: boolean
  preferredModel: string
  desktopNotifications: boolean
  shortcuts: ShortcutMap
}) {
  const [input, setInput] = useState('')
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
  const [permissionQueue, setPermissionQueue] = useState<PendingPermission[]>([])
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [toastDismissed, setToastDismissed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const clientRef = useRef<GrokAcpClient | null>(null)
  const streamTaskIdRef = useRef(task.id)
  /** True while an ACP prompt turn is open (blocks late chunks after finalize). */
  const streamOpenRef = useRef(false)
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
  approvalModeRef.current = approvalMode
  autoReconnectRef.current = autoReconnect
  preferredModelRef.current = preferredModel
  notificationsRef.current = desktopNotifications
  workspacePathRef.current = workspacePath
  const showReconnectToast = autoReconnect && reconnectAttempt > 0 && !connected && !toastDismissed
  const permission = permissionQueue[0] ?? null

  const liveEvents = asEvents(task.liveEvents)
  const branch = workspace?.branch

  useEffect(() => {
    setRenameValue(task.title)
    setRenaming(false)
    setTaskMenuOpen(false)
    setTagDraft('')
    setAttachments(task.attachments ?? [])
    setInput('')
    setModeOpen(false)
    setDragOver(false)
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
      if (clientRef.current) void clientRef.current.disconnect()
      onConnectionChange?.(false)
    }
  }, [])

  useEffect(() => {
    if (!connected) return
    const timer = window.setInterval(() => {
      void clientRef.current?.loadWorkspaceData().then(onWorkspaceData).catch(() => undefined)
    }, 1_500)
    return () => window.clearInterval(timer)
  }, [connected, onWorkspaceData])

  useEffect(() => {
    const onRefresh = () => {
      void clientRef.current?.loadWorkspaceData().then(onWorkspaceData).catch(() => undefined)
    }
    window.addEventListener('grok-forge-refresh-workspace', onRefresh)
    return () => window.removeEventListener('grok-forge-refresh-workspace', onRefresh)
  }, [onWorkspaceData])

  const handleEvent = useCallback((event: AcpUiEvent) => {
    const taskId = streamTaskIdRef.current
    if (event.kind === 'workspace') {
      void clientRef.current?.loadWorkspaceData().then(onWorkspaceData).catch(() => undefined)
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
      onTaskPatch(taskId, { appendLiveMessage: event.text, status: 'running', updatedAt: Date.now() })
      return
    }
    if (event.kind === 'plan') {
      onTaskPatch(taskId, {
        appendLiveEvent: event,
        planSteps: parsePlanEntries(event.entries),
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
      void clientRef.current?.loadWorkspaceData().then(onWorkspaceData).catch(() => undefined)
      return
    }
    if (event.kind === 'thought') {
      // Concatenate thought tokens into one block (same pattern as appendLiveMessage).
      onTaskPatch(taskId, { appendLiveThought: event.text, status: 'running', updatedAt: Date.now() })
      return
    }
  }, [onTaskPatch, onWorkspaceData])

  const refreshBilling = useCallback(async () => {
    const client = clientRef.current
    if (!client) {
      onBillingChange?.(null)
      onBillingRefreshingChange?.(false)
      return
    }
    onBillingRefreshingChange?.(true)
    try {
      const usage = await client.fetchBilling()
      onBillingChange?.(usage)
    } catch {
      onBillingChange?.(null)
    } finally {
      onBillingRefreshingChange?.(false)
    }
  }, [onBillingChange, onBillingRefreshingChange])

  const disconnect = async (intentional = true) => {
    intentionalDisconnectRef.current = intentional
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    streamOpenRef.current = false
    setPermissionQueue([])
    if (clientRef.current) {
      await clientRef.current.disconnect()
      clientRef.current = null
    }
    setConnected(false)
    onConnectionChange?.(false)
    onBillingChange?.(null)
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
    // Capture task identity at start so a mid-connect task switch does not mis-attribute the session.
    const connectTaskId = task.id
    const connectSessionKey = task.sessionKey ?? task.id
    const connectAcpSessionId = task.acpSessionId
    connectInFlightRef.current = true
    setConnecting(true)
    setConnectionError('')
    intentionalDisconnectRef.current = false
    try {
      const client = new GrokAcpClient()
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
      // Workspace load is best-effort — do not tear down a healthy ACP session if git fails.
      try {
        onWorkspaceData(await client.loadWorkspaceData())
      } catch {
        // ignore
      }
      // Live coding-credit usage for the sidebar meter (also best-effort).
      // Interval effect also refreshes once `connected` flips true.
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
      setConnected(false)
      onConnectionChange?.(false)
      onBillingChange?.(null)
      if (clientRef.current) {
        await clientRef.current.disconnect().catch(() => undefined)
        clientRef.current = null
      }
      if (autoReconnectRef.current && !intentionalDisconnectRef.current) {
        setToastDismissed(false)
        setReconnectAttempt((current) => current + 1)
      }
    } finally {
      connectInFlightRef.current = false
      setConnecting(false)
    }
  }
  connectRef.current = connect

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
    if (!openConnectArmedRef.current) return
    if (connected || connecting || connectInFlightRef.current) return
    if (intentionalDisconnectRef.current) return
    openConnectArmedRef.current = false
    void connectRef.current()
  }, [autoReconnect, backend.mode, workspacePath])

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
      await clientRef.current.cancel()
      streamOpenRef.current = false
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
      const textForAgent = buildAttachmentPrompt(prompt, extraAttachments)
      const blocks = [
        { type: 'text' as const, text: textForAgent || prompt || '请查看附件。' },
        ...toResourceBlocks(extraAttachments),
      ]
      void clientRef.current.promptBlocks(blocks, sessionKey).then(() => {
        if (promptGenerationRef.current !== generation) return
        streamOpenRef.current = false
        onTaskPatch(submittedTaskId, { finalizeAssistant: true, status: 'done', updatedAt: Date.now() })
        void showDesktopNotification('任务完成', nextTitle, notificationsRef.current)
      }).catch((error) => {
        if (promptGenerationRef.current !== generation) return
        streamOpenRef.current = false
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
      })
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
    const next = [...attachments, ...images]
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
    const next = [...attachments, ...dropped]
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

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const commitRename = () => {
    const next = renameValue.trim()
    if (next) onRenameTask(task.id, next)
    setRenaming(false)
    setTaskMenuOpen(false)
  }

  const addTag = () => {
    const next = toggleTaskTag(task.tags, tagDraft)
    if (next.length === (task.tags?.length ?? 0) && !tagDraft.trim()) return
    onTaskPatch(task.id, { tags: next, updatedAt: Date.now() })
    setTagDraft('')
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

  return (
    <main className="conversation-pane">
      <header className="task-header">
        <div>
          {renaming ? (
            <form className="rename-form" onSubmit={(event) => { event.preventDefault(); commitRename() }}>
              <input aria-label="重命名任务" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus onBlur={commitRename} />
            </form>
          ) : (
            <h1>{task.title}</h1>
          )}
          <div className="task-meta">
            <GitBranch size={12} />
            <span>{branch || '无分支'}</span>
            <span className="meta-sep">·</span>
            <span>{workspacePath || '请选择工作区'}</span>
            <span className="meta-sep">·</span>
            <span aria-label="当前模型">{modelLabel(preferredModel)}</span>
            <span className="task-status-pill">{statusLabel(task.status)}</span>
          </div>
          <div className="task-tag-editor" aria-label="任务标签">
            {(task.tags ?? []).map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag-chip"
                aria-label={`移除标签 ${tag}`}
                onClick={() => removeTag(tag)}
                title="点击移除标签"
              >
                #{tag} <X size={10} />
              </button>
            ))}
            <form
              className="tag-add-form"
              onSubmit={(event) => {
                event.preventDefault()
                addTag()
              }}
            >
              <input
                aria-label="添加任务标签"
                placeholder="添加标签…"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
              />
              <button type="submit" aria-label="确认添加标签">添加</button>
            </form>
          </div>
        </div>
        <div className="header-actions">
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
              <MoreHorizontal size={18} />
            </button>
            {taskMenuOpen && (
              <div className="task-menu" role="menu" aria-label="任务选项菜单">
                <button type="button" role="menuitem" onClick={() => { setRenaming(true); setTaskMenuOpen(false) }}>重命名任务</button>
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
          <button className="icon-button" aria-label="打开审阅面板" type="button" onClick={onOpenReview}><PanelRightOpen size={18} /></button>
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
              {liveEvents.map((event, index) => (
                <div
                  className={`live-event ${event.kind}`}
                  key={event.kind === 'tool' && event.toolCallId
                    ? `tool-${event.toolCallId}`
                    : `${event.kind}-${index}`}
                >
                  {event.kind === 'tool' ? (
                    <>
                      <Code2 size={13} />
                      <span>{event.title}</span>
                      {event.detail && <small className="event-detail">{event.detail}</small>}
                      <em>{event.status}</em>
                    </>
                  ) : event.kind === 'plan' ? (
                    <><Activity size={13} /><span>收到执行计划 · {event.entries.length} 项</span></>
                  ) : null}
                </div>
              ))}
              {task.liveMessage && (
                <MarkdownView source={task.liveMessage} className="live-message md-agent" />
              )}
            </div>
          </div>
        )}

        {permission && (
          <PermissionBanner
            permission={permission}
            queueLength={permissionQueue.length}
            onSelect={(option) => void respondPermission(option)}
          />
        )}
        <ChangeSummary workspace={workspace} onOpenReview={onOpenReview} />
        {connectionError && <div className="connection-error" role="alert">{connectionError}</div>}
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
                if (isDataImageAttachment(file)) {
                  return (
                    <div
                      key={`${attachmentLabel(file)}-${index}`}
                      className="attachment-image-card"
                    >
                      <img src={file} alt={attachmentLabel(file)} className="attachment-preview" />
                      <button
                        type="button"
                        className="attachment-image-remove"
                        aria-label={`移除 ${attachmentLabel(file)}`}
                        title="移除图片"
                        onClick={removeAttachment}
                      >
                        <X size={12} />
                      </button>
                    </div>
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
          <textarea
            ref={composerRef}
            aria-label="任务输入"
            value={input}
            onChange={(event) => setInput(event.target.value)}
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

function toReviewFile(file: WorkspaceData['files'][number]): ReviewFile {
  const diff: ReviewFile['diff'] = []
  let oldLine = 0
  let nextLine = 0
  for (const value of (file.patch ?? '').split('\n')) {
    const header = /^@@ -(\d+)[^ ]* \+(\d+)/.exec(value)
    if (header) { oldLine = Number(header[1]); nextLine = Number(header[2]); continue }
    if (value.startsWith('+') && !value.startsWith('+++')) diff.push({ type: 'add', old: '', next: String(nextLine++), value: value.slice(1) })
    else if (value.startsWith('-') && !value.startsWith('---')) diff.push({ type: 'remove', old: String(oldLine++), next: '', value: value.slice(1) })
    else if (value.startsWith(' ')) diff.push({ type: 'same', old: String(oldLine++), next: String(nextLine++), value: value.slice(1) })
  }
  return { shortName: file.path.split(/[\\/]/).at(-1) ?? file.path, path: file.path, additions: file.additions, deletions: file.deletions, diff }
}

function ReviewPane({
  workspace,
  workspacePath = '',
  connected,
  onClose,
  onRequestRevert,
  onConfirmReviewed,
  onRefreshWorkspace,
  onFileActionMessage,
  onRecordExport,
}: {
  workspace: WorkspaceData | null
  /** Used to spawn a local shell in the selected workspace even before Grok connects. */
  workspacePath?: string
  connected: boolean
  onClose: () => void
  /** Fallback when local git restore fails for some/all paths — usually inject a Grok prompt. */
  onRequestRevert: (paths: string[]) => void
  onConfirmReviewed: (summary: string) => void
  onRefreshWorkspace?: () => void
  onFileActionMessage?: (message: string) => void
  onRecordExport?: (entry: {
    kind: ExportHistoryKind
    label: string
    filename: string
    content?: string
    mime?: string
  }) => void
}) {
  const files = useMemo(() => workspace?.files.map(toReviewFile) ?? [], [workspace])
  const [localTerminals, setLocalTerminals] = useState<LocalTerminal[]>([])
  const remoteTerminals = workspace?.terminals ?? []
  const terminals = useMemo(() => {
    const remote = remoteTerminals.map((item) => ({
      terminalId: item.terminalId,
      name: item.name || item.terminalId,
      status: item.status,
      exitCode: item.exitCode,
      output: item.output,
      truncated: item.truncated,
      source: 'remote' as const,
    }))
    const local = localTerminals.map((item) => ({
      ...item,
      source: 'local' as const,
    }))
    return [...local, ...remote]
  }, [localTerminals, remoteTerminals])

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTerminalKey, setSelectedTerminalKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'diff' | 'terminal'>('diff')
  const [reviewState, setReviewState] = useState<'pending' | 'confirmed' | 'revert-help'>('pending')
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [acceptedPaths, setAcceptedPaths] = useState<string[]>([])
  const [rejectedPaths, setRejectedPaths] = useState<string[]>([])
  const [hunkDecisionsByPath, setHunkDecisionsByPath] = useState<Record<string, Record<string, 'accept' | 'reject'>>>({})
  const [activeHunkId, setActiveHunkId] = useState<string | null>(null)
  const [previewDecisions, setPreviewDecisions] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(true)
  const [diffLayout, setDiffLayout] = useState<'unified' | 'split'>('unified')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [showAllHunks, setShowAllHunks] = useState(false)
  const [collapseUnchanged, setCollapseUnchanged] = useState(true)
  const [expandedFolds, setExpandedFolds] = useState<string[]>([])
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([])
  const [actionError, setActionError] = useState('')
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalSending, setTerminalSending] = useState(false)
  const terminalOutputRef = useRef<HTMLDivElement | null>(null)
  const selected = files.find((file) => file.path === selectedPath) ?? files[0]
  const selectedLanguage = selected ? languageFromPath(selected.path) : 'text'
  const terminal = terminals.find((item) => `${item.source}:${item.terminalId}` === selectedTerminalKey) ?? terminals[0]
  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const hasChanges = files.length > 0
  const selectedAccepted = selected ? acceptedPaths.includes(selected.path) : false
  const selectedRejected = selected ? rejectedPaths.includes(selected.path) : false
  // Hunks for accept/reject always use the original diff so workspace edits stay accurate.
  const hunks = useMemo(() => (selected ? splitDiffIntoHunks(selected.diff) : []), [selected])
  const hunkDecisions = selected ? (hunkDecisionsByPath[selected.path] ?? {}) : {}
  const activeHunk: DiffHunk | null = hunks.find((hunk) => hunk.id === activeHunkId) ?? hunks[0] ?? null
  const previewLines = useMemo(() => {
    if (!selected || !previewDecisions) return null
    return applyHunkDecisionsToDiff(selected.diff, hunks, hunkDecisions)
  }, [selected, previewDecisions, hunks, hunkDecisions])
  const rawVisibleLines: DiffLine[] = previewLines
    ?? (showAllHunks ? (selected?.diff ?? []) : (activeHunk?.lines ?? selected?.diff ?? []))
  const visibleLines = useMemo(
    () => (ignoreWhitespace ? applyIgnoreWhitespace(rawVisibleLines) : rawVisibleLines),
    [ignoreWhitespace, rawVisibleLines],
  )
  const expandedFoldSet = useMemo(() => new Set(expandedFolds), [expandedFolds])
  const diffBlocks = useMemo((): DiffViewBlock[] => {
    if (!collapseUnchanged) {
      return visibleLines.map((line) => ({ kind: 'line' as const, line }))
    }
    return foldUnchangedDiff(visibleLines, { expandedIds: expandedFoldSet })
  }, [collapseUnchanged, visibleLines, expandedFoldSet])
  const visibleChangeStats = useMemo(() => countDiffChanges(visibleLines), [visibleLines])
  const decisionPreviewText = useMemo(
    () => (selected ? previewHunkDecisions(hunks, hunkDecisions) : ''),
    [selected, hunks, hunkDecisions],
  )
  const fileChecklist = useMemo(
    () => buildFileDecisionChecklist(files, acceptedPaths, rejectedPaths, hunkDecisionsByPath),
    [files, acceptedPaths, rejectedPaths, hunkDecisionsByPath],
  )
  const checklistSummary = useMemo(() => summarizeFileDecisionChecklist(fileChecklist), [fileChecklist])
  const checklistText = useMemo(() => formatFileDecisionChecklist(fileChecklist), [fileChecklist])
  const pinnedFiles = useMemo(
    () => pinnedPaths
      .map((path) => files.find((file) => file.path === path))
      .filter((file): file is ReviewFile => Boolean(file)),
    [pinnedPaths, files],
  )

  const setHunkDecision = (path: string, hunkId: string, decision: 'accept' | 'reject') => {
    setHunkDecisionsByPath((current) => ({
      ...current,
      [path]: { ...(current[path] ?? {}), [hunkId]: decision },
    }))
  }

  // Fingerprint content so 1.5s workspace polls (new array identity) do not wipe decisions.
  const filesFingerprint = useMemo(
    () => workspaceFilesFingerprint(workspace?.files ?? []),
    [workspace?.files],
  )

  useEffect(() => {
    setReviewState('pending')
    setAcceptedPaths([])
    setRejectedPaths([])
    setHunkDecisionsByPath({})
    setActiveHunkId(null)
    setActionError('')
    setPinnedPaths((current) => current.filter((path) => (workspace?.files ?? []).some((file) => file.path === path)))
  }, [filesFingerprint])

  useEffect(() => {
    setActiveHunkId(null)
    setPreviewDecisions(false)
    setShowAllHunks(false)
    setExpandedFolds([])
  }, [selected?.path])

  const toggleFold = (id: string) => {
    setExpandedFolds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const renderDiffFold = (block: Extract<DiffViewBlock, { kind: 'fold' }>) => (
    <button
      key={block.id}
      type="button"
      className="diff-fold"
      aria-label={`展开隐藏的 ${block.count} 行上下文`}
      onClick={() => toggleFold(block.id)}
    >
      {summarizeFoldedLines(block.count)}
    </button>
  )

  useEffect(() => {
    if (!terminals.some((item) => `${item.source}:${item.terminalId}` === selectedTerminalKey)) {
      const first = terminals[0]
      setSelectedTerminalKey(first ? `${first.source}:${first.terminalId}` : null)
    }
  }, [terminals, selectedTerminalKey])

  const refreshLocalTerminals = useCallback(async () => {
    try {
      setLocalTerminals(await terminalList())
    } catch {
      setLocalTerminals([])
    }
  }, [])

  useEffect(() => {
    void refreshLocalTerminals()
    if (!connected) return
    const timer = window.setInterval(() => { void refreshLocalTerminals() }, 2_000)
    return () => window.clearInterval(timer)
  }, [connected, refreshLocalTerminals])

  useEffect(() => {
    let unlistenChunk: (() => void) | undefined
    let unlistenExit: (() => void) | undefined
    void listenForTerminalChunks((event) => {
      setLocalTerminals((current) => {
        const existing = current.find((item) => item.terminalId === event.terminalId)
        if (!existing) {
          return [
            ...current,
            {
              terminalId: event.terminalId,
              name: event.terminalId,
              status: 'running',
              output: event.chunk,
              truncated: false,
            },
          ]
        }
        return current.map((item) => (
          item.terminalId === event.terminalId
            ? { ...item, status: 'running', output: `${item.output}${event.chunk}` }
            : item
        ))
      })
    }).then((fn) => { unlistenChunk = fn })
    void listenForTerminalExit((event) => {
      setLocalTerminals((current) => current.map((item) => (
        item.terminalId === event.terminalId ? { ...item, status: 'exited' } : item
      )))
    }).then((fn) => { unlistenExit = fn })
    return () => {
      unlistenChunk?.()
      unlistenExit?.()
    }
  }, [])

  const copySelectedPath = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected.path)
    } catch {
      // ignore
    }
    setFileMenuOpen(false)
  }

  const exportSelectedPatch = () => {
    if (!selected) return
    const patch = toUnifiedPatch(selected.path, selected.diff)
    const filename = patchExportFilename(selected.path)
    const mime = 'text/x-patch;charset=utf-8'
    downloadTextFile(filename, patch, mime)
    onRecordExport?.({ kind: 'patch', label: selected.path, filename, content: patch, mime })
    onFileActionMessage?.(summarizePatchExport(1, selected.path))
    setFileMenuOpen(false)
  }

  const exportAllPatches = () => {
    if (files.length === 0) return
    const patch = toMultiFilePatch(files.map((file) => ({ path: file.path, diff: file.diff })))
    const filename = patchExportFilename('all-changes')
    const mime = 'text/x-patch;charset=utf-8'
    downloadTextFile(filename, patch, mime)
    onRecordExport?.({ kind: 'patch-all', label: `${files.length} 个文件`, filename, content: patch, mime })
    onFileActionMessage?.(summarizePatchExport(files.length))
    setFileMenuOpen(false)
  }

  const copySelectedPatch = async () => {
    if (!selected) return
    const patch = toUnifiedPatch(selected.path, selected.diff)
    try {
      await navigator.clipboard.writeText(patch)
      onRecordExport?.({
        kind: 'patch-copy',
        label: selected.path,
        filename: patchExportFilename(selected.path),
        content: patch,
        mime: 'text/x-patch;charset=utf-8',
      })
      onFileActionMessage?.(summarizePatchCopy(1, selected.path))
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制 patch 失败')
    }
    setFileMenuOpen(false)
  }

  const copyAllPatches = async () => {
    if (files.length === 0) return
    const patch = toMultiFilePatch(files.map((file) => ({ path: file.path, diff: file.diff })))
    try {
      await navigator.clipboard.writeText(patch)
      onRecordExport?.({
        kind: 'patch-copy-all',
        label: `${files.length} 个文件`,
        filename: patchExportFilename('all-changes'),
        content: patch,
        mime: 'text/x-patch;charset=utf-8',
      })
      onFileActionMessage?.(summarizePatchCopy(files.length))
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制 patch 失败')
    }
    setFileMenuOpen(false)
  }

  const acceptSelectedFile = async () => {
    if (!selected) return
    setActionError('')
    try {
      const staged = await gitStageFiles([selected.path])
      if (staged.failed > 0) {
        const detail = staged.results.find((row) => !row.ok)?.error
        throw new Error(detail || `暂存失败：${selected.path}`)
      }
      setAcceptedPaths((current) => [...new Set([...current, selected.path])])
      setRejectedPaths((current) => current.filter((path) => path !== selected.path))
      onFileActionMessage?.(summarizeFileAction(selected.path, 'accept'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
    setFileMenuOpen(false)
  }

  const rejectSelectedFile = async () => {
    if (!selected) return
    setActionError('')
    try {
      await gitRestoreFile(selected.path)
      setRejectedPaths((current) => [...new Set([...current, selected.path])])
      setAcceptedPaths((current) => current.filter((path) => path !== selected.path))
      onFileActionMessage?.(summarizeFileAction(selected.path, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      onRequestRevert([selected.path])
      setReviewState('revert-help')
    }
    setFileMenuOpen(false)
  }

  const confirmReviewed = async () => {
    if (!hasChanges || reviewState === 'confirmed') return
    setActionError('')
    const paths = pathsToStageOnConfirm(files, acceptedPaths, rejectedPaths)
    try {
      if (paths.length > 0) {
        const staged = await gitStageFiles(paths)
        const summary = summarizeReviewStage(staged.succeeded, staged.failed)
        if (staged.failed > 0 && staged.succeeded === 0) {
          setActionError(summary)
          onFileActionMessage?.(summary)
          return
        }
        if (staged.succeeded > 0) {
          setAcceptedPaths((current) => [...new Set([...current, ...staged.results.filter((r) => r.ok).map((r) => r.path)])])
        }
        setReviewState('confirmed')
        onConfirmReviewed(summary)
        onRefreshWorkspace?.()
        if (staged.failed > 0) setActionError(summary)
      } else {
        const summary = summarizeReviewStage(0, 0)
        setReviewState('confirmed')
        onConfirmReviewed(summary)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      onFileActionMessage?.(message)
    }
  }

  const requestRevertAll = async () => {
    if (!hasChanges || reviewState === 'confirmed') return
    const paths = files.map((file) => file.path)
    setActionError('')
    try {
      const restored = await gitRestoreFiles(paths)
      const summary = summarizeReviewRestore(restored.succeeded, restored.failed)
      onFileActionMessage?.(summary)
      if (restored.succeeded > 0) {
        setRejectedPaths((current) => [...new Set([...current, ...restored.results.filter((r) => r.ok).map((r) => r.path)])])
        setAcceptedPaths((current) => current.filter((path) => !restored.results.some((r) => r.ok && r.path === path)))
        onRefreshWorkspace?.()
      }
      const failedPaths = restored.results.filter((r) => !r.ok).map((r) => r.path)
      if (restored.failed > 0) {
        setActionError(summary)
        if (failedPaths.length > 0) {
          onRequestRevert(failedPaths)
          setReviewState('revert-help')
        }
      } else {
        setReviewState('revert-help')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      onRequestRevert(paths)
      setReviewState('revert-help')
    }
  }

  const acceptHunk = (hunk: DiffHunk) => {
    if (!selected) return
    setHunkDecision(selected.path, hunk.id, 'accept')
    onFileActionMessage?.(summarizeHunkAction(selected.path, hunk.id, 'accept'))
  }

  const rejectHunk = async (hunk: DiffHunk) => {
    if (!selected) return
    setActionError('')
    try {
      const content = await readTextFile(selected.path)
      const next = rejectHunkInContent(content, hunk)
      await writeTextFile(selected.path, next)
      setHunkDecision(selected.path, hunk.id, 'reject')
      onFileActionMessage?.(summarizeHunkAction(selected.path, hunk.id, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const applyAllHunkDecisions = async () => {
    if (!selected) return
    const stats = countHunkDecisions(hunkDecisions)
    if (stats.total === 0) {
      setActionError('请先对至少一个片段选择接受或拒绝。')
      return
    }
    setActionError('')
    try {
      if (stats.reject > 0) {
        const content = await readTextFile(selected.path)
        const next = applyHunkDecisionsToContent(content, hunks, hunkDecisions)
        await writeTextFile(selected.path, next)
      }
      onFileActionMessage?.(summarizeBatchApply(selected.path, stats.accept, stats.reject))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const acceptAllHunks = () => {
    if (!selected || hunks.length === 0) return
    setHunkDecisionsByPath((current) => ({
      ...current,
      [selected.path]: buildAllHunkDecisions(hunks, 'accept'),
    }))
    setActionError('')
    onFileActionMessage?.(summarizeMarkAllHunks(selected.path, hunks.length, 'accept'))
  }

  const rejectAllHunks = async () => {
    if (!selected || hunks.length === 0) return
    setActionError('')
    const decisions = buildAllHunkDecisions(hunks, 'reject')
    try {
      const content = await readTextFile(selected.path)
      const next = applyHunkDecisionsToContent(content, hunks, decisions)
      await writeTextFile(selected.path, next)
      setHunkDecisionsByPath((current) => ({
        ...current,
        [selected.path]: decisions,
      }))
      onFileActionMessage?.(summarizeMarkAllHunks(selected.path, hunks.length, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const killLocalTerminal = async (terminalId: string) => {
    try {
      await terminalKill(terminalId)
      await refreshLocalTerminals()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const canWriteTerminal = Boolean(
    terminal
    && terminal.source === 'local'
    && terminal.interactive
    && terminal.status !== 'exited',
  )

  const openLocalShell = async () => {
    setActionError('')
    try {
      if (!workspacePath.trim()) {
        throw new Error('请先选择工作区，再新建本地终端。')
      }
      const terminalId = await terminalOpenShell(workspacePath)
      await refreshLocalTerminals()
      setSelectedTerminalKey(`local:${terminalId}`)
      setActiveTab('terminal')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const sendTerminalLine = async () => {
    if (!terminal || terminal.source !== 'local' || !canWriteTerminal) return
    const line = terminalInput
    if (!line.trim()) return
    setTerminalSending(true)
    setActionError('')
    try {
      await terminalWrite(terminal.terminalId, line)
      setTerminalInput('')
      // Optimistic echo (backend also records it); chunks will append process output.
      setLocalTerminals((current) => current.map((item) => (
        item.terminalId === terminal.terminalId
          ? {
            ...item,
            output: `${item.output}${item.output.endsWith('\n') || !item.output ? '' : '\n'}› ${line}\n`,
          }
          : item
      )))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setTerminalSending(false)
    }
  }

  useEffect(() => {
    const el = terminalOutputRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [terminal?.output, activeTab])

  return (
    <section className="review-pane" aria-label="变更审阅">
      <div className="review-tabs">
        <button role="tab" aria-selected={activeTab === 'diff'} className={activeTab === 'diff' ? 'active' : ''} onClick={() => setActiveTab('diff')} type="button"><FileDiff size={14} /> 变更 <span>{files.length}</span></button>
        <button role="tab" aria-selected={activeTab === 'terminal'} className={activeTab === 'terminal' ? 'active' : ''} onClick={() => setActiveTab('terminal')} type="button"><SquareTerminal size={14} /> 终端 <span>{terminals.length}</span></button>
        <button className="close-pane" aria-label="关闭审阅面板" onClick={onClose} type="button"><PanelRightClose size={16} /></button>
      </div>

      {activeTab === 'diff' ? (
        <>
          <div className="review-summary">
            <div>
              <strong>待审阅的改动</strong>
              <small>
                {workspace
                  ? `${files.length} 个文件已修改${workspace.branch ? ` · ${workspace.branch}` : ''}${
                    workspace.gitSource === 'local' ? ' · 本地 git' : ''
                  }`
                  : '连接 Grok 以读取实时变更'}
              </small>
            </div>
            <div className="review-view-toggles" role="group" aria-label="Diff 视图">
              <button
                type="button"
                className={diffLayout === 'unified' ? 'active' : ''}
                aria-pressed={diffLayout === 'unified'}
                aria-label="统一 diff 视图"
                onClick={() => setDiffLayout('unified')}
              >
                统一
              </button>
              <button
                type="button"
                className={diffLayout === 'split' ? 'active' : ''}
                aria-pressed={diffLayout === 'split'}
                aria-label="并排 diff 视图"
                onClick={() => setDiffLayout('split')}
              >
                并排
              </button>
              <button
                type="button"
                className={ignoreWhitespace ? 'active' : ''}
                aria-pressed={ignoreWhitespace}
                aria-label="忽略空白差异"
                onClick={() => setIgnoreWhitespace((value) => !value)}
              >
                忽略空白
              </button>
              <button
                type="button"
                className={showAllHunks ? 'active' : ''}
                aria-pressed={showAllHunks}
                aria-label="展开全部片段"
                onClick={() => setShowAllHunks((value) => !value)}
              >
                {showAllHunks ? '按片段' : '展开全部'}
              </button>
              <button
                type="button"
                className={collapseUnchanged ? 'active' : ''}
                aria-pressed={collapseUnchanged}
                aria-label="折叠未改动上下文"
                onClick={() => {
                  setCollapseUnchanged((value) => !value)
                  setExpandedFolds([])
                }}
              >
                折叠上下文
              </button>
            </div>
            <div className="summary-count">
              <span>+{ignoreWhitespace ? visibleChangeStats.additions : additions}</span>
              <del>−{ignoreWhitespace ? visibleChangeStats.deletions : deletions}</del>
            </div>
          </div>
          {files.length > 0 && (
            <div className="decision-checklist" aria-label="文件决策清单">
              <div className="decision-checklist-header">
                <button
                  type="button"
                  className="checklist-toggle"
                  aria-expanded={checklistOpen}
                  aria-label={checklistOpen ? '收起决策清单' : '展开决策清单'}
                  onClick={() => setChecklistOpen((open) => !open)}
                >
                  {checklistOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <strong>决策清单</strong>
                </button>
                <small>
                  文件 接受 {checklistSummary.accepted}/拒绝 {checklistSummary.rejected}/待审 {checklistSummary.pending}
                  {' · '}
                  片段 接受 {checklistSummary.acceptHunks}/拒绝 {checklistSummary.rejectHunks}
                </small>
              </div>
              {checklistOpen && (
                <>
                  <div className="decision-checklist-list">
                    {fileChecklist.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        className={`decision-row ${selected?.path === entry.path ? 'active' : ''} ${entry.fileDecision}`}
                        aria-label={`决策 ${entry.shortName}`}
                        onClick={() => setSelectedPath(entry.path)}
                      >
                        <FileCode2 size={13} />
                        <span className="decision-name">{entry.shortName}</span>
                        <em className={`file-tag ${entry.fileDecision === 'pending' ? '' : entry.fileDecision}`}>
                          {entry.fileDecision === 'accept' ? '文件接受' : entry.fileDecision === 'reject' ? '文件拒绝' : '待审'}
                        </em>
                        <small>
                          片段 {entry.acceptHunks}/{entry.rejectHunks}/{entry.undecidedHunks}
                        </small>
                        <em>+{entry.additions}</em>
                        {entry.deletions > 0 && <del>−{entry.deletions}</del>}
                      </button>
                    ))}
                  </div>
                  <pre className="decision-checklist-text" aria-label="决策清单摘要">{checklistText}</pre>
                </>
              )}
            </div>
          )}
          <div className="file-list">
            {files.map((file) => (
              <div key={file.path} className={`file-row ${selected?.path === file.path ? 'active' : ''}`}>
                <button className="file-row-main" onClick={() => setSelectedPath(file.path)} aria-label={`查看 ${file.shortName}`} type="button">
                  <FileCode2 size={14} />
                  <span>{file.shortName}</span>
                  {acceptedPaths.includes(file.path) && <em className="file-tag accept">已接受</em>}
                  {rejectedPaths.includes(file.path) && <em className="file-tag reject">已拒绝</em>}
                  <em>+{file.additions}</em>
                  {file.deletions > 0 && <del>−{file.deletions}</del>}
                </button>
                <button
                  type="button"
                  className={`file-pin ${pinnedPaths.includes(file.path) ? 'active' : ''}`}
                  aria-label={pinnedPaths.includes(file.path) ? `取消固定 ${file.shortName}` : `固定对比 ${file.shortName}`}
                  aria-pressed={pinnedPaths.includes(file.path)}
                  onClick={() => setPinnedPaths((current) => togglePinnedPath(current, file.path))}
                >
                  钉
                </button>
              </div>
            ))}
          </div>
          {pinnedFiles.length > 0 && (
            <div className="multi-diff" aria-label="多文件对比">
              <div className="multi-diff-heading">
                <strong>并排多文件</strong>
                <small>最多固定 3 个文件</small>
                <button type="button" aria-label="清空固定文件" onClick={() => setPinnedPaths([])}>清空</button>
              </div>
              <div className={`multi-diff-grid count-${pinnedFiles.length}`}>
                {pinnedFiles.map((file) => {
                  const lines = toSplitDiffRows(file.diff).slice(0, 40)
                  return (
                    <div key={file.path} className="multi-diff-card">
                      <header>
                        <button type="button" onClick={() => setSelectedPath(file.path)}>{file.shortName}</button>
                        <em>+{file.additions}/−{file.deletions}</em>
                      </header>
                      <div className="split-diff compact" aria-label={`${file.shortName} 并排预览`}>
                        {lines.map((row, index) => (
                          <div className="split-row" key={`${file.path}-${index}`}>
                            <div className={`split-cell ${row.oldKind}`}>
                              <span>{row.oldNo}</span>
                              <code>{row.oldText || ' '}</code>
                            </div>
                            <div className={`split-cell ${row.newKind}`}>
                              <span>{row.newNo}</span>
                              <code>{row.newText || ' '}</code>
                            </div>
                          </div>
                        ))}
                        {file.diff.length > 40 && <div className="multi-diff-more">… 仅预览前 40 行</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {selected ? (
            <>
              <div className="diff-header">
                <FileCode2 size={14} />
                <span>{selected.path}</span>
                <div className="file-actions">
                  <button type="button" className="file-action accept" aria-label="复制此文件 patch" onClick={() => void copySelectedPatch()}>
                    复制 patch
                  </button>
                  <button type="button" className="file-action accept" aria-label="导出此文件 patch" onClick={exportSelectedPatch}>
                    导出 patch
                  </button>
                  <button type="button" className="file-action accept" aria-label="接受此文件改动" disabled={selectedAccepted} onClick={() => void acceptSelectedFile()}>
                    接受
                  </button>
                  <button type="button" className="file-action reject" aria-label="拒绝此文件改动" disabled={selectedRejected} onClick={() => void rejectSelectedFile()}>
                    拒绝
                  </button>
                </div>
                <div className="file-menu-wrap">
                  <button aria-label="文件选项" type="button" onClick={() => setFileMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>
                  {fileMenuOpen && (
                    <div className="task-menu file-menu" role="menu" aria-label="文件选项菜单">
                      <button type="button" role="menuitem" onClick={() => void copySelectedPath()}>复制路径</button>
                      <button type="button" role="menuitem" onClick={() => void copySelectedPatch()}>复制此文件 patch</button>
                      <button type="button" role="menuitem" onClick={() => void copyAllPatches()} disabled={files.length === 0}>
                        复制全部 patch
                      </button>
                      <button type="button" role="menuitem" onClick={exportSelectedPatch}>导出此文件 patch</button>
                      <button type="button" role="menuitem" onClick={exportAllPatches} disabled={files.length === 0}>
                        导出全部 patch
                      </button>
                      <button type="button" role="menuitem" onClick={() => void acceptSelectedFile()}>接受此文件</button>
                      <button type="button" role="menuitem" onClick={() => void rejectSelectedFile()}>拒绝并还原此文件</button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onRequestRevert([selected.path])
                          setReviewState('revert-help')
                          setFileMenuOpen(false)
                        }}
                      >
                        让 Grok 撤销此文件
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {hunks.length > 0 && (
                <div className="hunk-list" role="tablist" aria-label="改动片段">
                  {hunks.map((hunk) => (
                    <button
                      key={hunk.id}
                      type="button"
                      role="tab"
                      aria-selected={!showAllHunks && activeHunk?.id === hunk.id}
                      className={`hunk-chip ${!showAllHunks && activeHunk?.id === hunk.id ? 'active' : ''} ${hunkDecisions[hunk.id] ?? ''}`}
                      onClick={() => {
                        setShowAllHunks(false)
                        setActiveHunkId(hunk.id)
                      }}
                    >
                      {hunk.id}
                      <em>+{hunk.additions}/−{hunk.deletions}</em>
                      {hunkDecisions[hunk.id] === 'accept' && <span>接受</span>}
                      {hunkDecisions[hunk.id] === 'reject' && <span>拒绝</span>}
                    </button>
                  ))}
                </div>
              )}
              {(activeHunk || showAllHunks) && (
                <div className="hunk-toolbar">
                  <strong>{showAllHunks ? `全部片段 · ${hunks.length} 个` : activeHunk?.title}</strong>
                  <div className="file-actions">
                    {activeHunk && !showAllHunks && (
                      <>
                        <button type="button" className="file-action accept" aria-label={`接受片段 ${activeHunk.id}`} onClick={() => acceptHunk(activeHunk)}>接受片段</button>
                        <button type="button" className="file-action reject" aria-label={`拒绝片段 ${activeHunk.id}`} onClick={() => void rejectHunk(activeHunk)}>拒绝片段</button>
                      </>
                    )}
                    {hunks.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="file-action accept"
                          aria-label="全部接受片段"
                          onClick={acceptAllHunks}
                        >
                          全部接受
                        </button>
                        <button
                          type="button"
                          className="file-action reject"
                          aria-label="全部拒绝片段"
                          onClick={() => void rejectAllHunks()}
                        >
                          全部拒绝
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`file-action accept ${previewDecisions ? 'active' : ''}`}
                      aria-label="预览片段决策"
                      aria-pressed={previewDecisions}
                      onClick={() => setPreviewDecisions((open) => !open)}
                    >
                      {previewDecisions ? '关闭预览' : '预览决策'}
                    </button>
                    <button
                      type="button"
                      className="file-action accept"
                      aria-label="批量应用片段决策"
                      onClick={() => void applyAllHunkDecisions()}
                    >
                      应用全部决策
                    </button>
                  </div>
                </div>
              )}
              {previewDecisions && (
                <pre className="hunk-preview" aria-label="片段决策预览">{decisionPreviewText}</pre>
              )}
              {actionError && <div className="connection-error review-action-error" role="alert">{actionError}</div>}
              {diffLayout === 'split' ? (
                <div className={`split-diff ${previewDecisions ? 'previewing' : ''}`} aria-label="并排 diff">
                  <div className="split-head">
                    <span>旧版本</span>
                    <span>新版本</span>
                  </div>
                  {diffBlocks.map((block, index) => {
                    if (block.kind === 'fold') return renderDiffFold(block)
                    const rows = toSplitDiffRows([block.line])
                    const row = rows[0]
                    if (!row) return null
                    return (
                      <div className="split-row" key={`${row.oldNo}-${row.newNo}-${index}`}>
                        <div className={`split-cell ${row.oldKind}`}>
                          <span className="line-no">{row.oldNo}</span>
                          <HighlightedCode text={row.oldText || ' '} language={selectedLanguage} />
                        </div>
                        <div className={`split-cell ${row.newKind}`}>
                          <span className="line-no">{row.newNo}</span>
                          <HighlightedCode text={row.newText || ' '} language={selectedLanguage} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className={`diff-view ${previewDecisions ? 'previewing' : ''}`} aria-label="统一 diff">
                  {diffBlocks.map((block, index) => {
                    if (block.kind === 'fold') return renderDiffFold(block)
                    const line = block.line
                    return (
                      <div className={`diff-line ${line.type}`} key={`${line.next}-${line.old}-${index}`}>
                        <span className="line-no">{line.old}</span>
                        <span className="line-no">{line.next}</span>
                        <span className="diff-prefix">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span>
                        <HighlightedCode text={line.value || ' '} language={selectedLanguage} />
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="diff-view empty-review">
              {workspace
                ? workspace.gitAvailable
                  ? '暂无 Git 变更。'
                  : '无法读取 Git 变更：运行时缺少 x.ai/git/*，且本地 git 回退不可用（请确认工作区是 Git 仓库并已安装 git）。'
                : '连接 Grok 后将在这里显示实时 Git 变更。'}
            </div>
          )}
          <div className="review-footer">
            <div className={`review-state ${reviewState === 'confirmed' ? 'applied' : ''}`} role={reviewState === 'revert-help' || reviewState === 'confirmed' ? 'status' : undefined}>
              {reviewState === 'confirmed' ? <Check size={14} /> : <ShieldCheck size={14} />}
              {reviewState === 'confirmed'
                ? '已确认并暂存'
                : reviewState === 'revert-help'
                  ? (connected ? '已处理撤销（本地优先，失败则请 Grok）' : '已尝试本地还原')
                  : '等待你的审阅'}
            </div>
            <div>
              <button
                className="reject-button"
                disabled={!hasChanges || reviewState === 'confirmed'}
                onClick={() => void requestRevertAll()}
                type="button"
                aria-label="请求撤销"
                title="优先本地 git 还原全部文件；失败时再请 Grok 处理"
              >
                <X size={14} /> 请求撤销
              </button>
              <button
                className="apply-button"
                disabled={!hasChanges || reviewState === 'confirmed'}
                onClick={() => void confirmReviewed()}
                type="button"
                aria-label="确认审阅"
                title="将已接受（或未拒绝）的文件 git add 暂存，不会自动 commit"
              >
                <Check size={14} /> 确认审阅
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="terminal-view">
          <div className="terminal-toolbar">
            <div className="terminal-tabs" role="tablist" aria-label="终端列表">
              {terminals.length === 0 ? (
                <span className="terminal-empty-label">暂无终端</span>
              ) : (
                terminals.map((item) => (
                  <button
                    key={`${item.source}-${item.terminalId}`}
                    type="button"
                    role="tab"
                    aria-selected={selectedTerminalKey === `${item.source}:${item.terminalId}`}
                    className={selectedTerminalKey === `${item.source}:${item.terminalId}` ? 'active' : ''}
                    onClick={() => setSelectedTerminalKey(`${item.source}:${item.terminalId}`)}
                  >
                    {item.source === 'local' ? '本地 · ' : ''}{item.name || item.terminalId}
                    {item.source === 'local' && item.interactive ? ' · 交互' : ''}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className="terminal-refresh"
              aria-label="新建本地 Shell"
              title="在当前工作区启动交互式 PowerShell / shell"
              onClick={() => void openLocalShell()}
            >
              新建
            </button>
            <button
              type="button"
              className="terminal-refresh"
              aria-label="刷新终端"
              onClick={() => {
                onRefreshWorkspace?.()
                void refreshLocalTerminals()
              }}
              disabled={!connected && localTerminals.length === 0}
            >
              刷新
            </button>
            {terminal?.source === 'local' && (
              <button
                type="button"
                className="terminal-refresh danger"
                aria-label="终止本地终端"
                onClick={() => void killLocalTerminal(terminal.terminalId)}
              >
                终止
              </button>
            )}
          </div>
          <div className="terminal-command">
            <span>PS</span> {terminal?.name ?? terminal?.terminalId ?? '暂无活跃终端'}
            {terminal?.status && <em>{terminal.status}</em>}
            {typeof terminal?.exitCode === 'number' && <em>exit {terminal.exitCode}</em>}
            {terminal?.source && <em>{terminal.source === 'local' ? (terminal.interactive ? '本地交互' : '客户端') : 'Grok'}</em>}
          </div>
          <div className="terminal-output" ref={terminalOutputRef} aria-label="终端输出">
            {terminal?.output
              || (localTerminals.length === 0 && !(workspace?.terminals?.length)
                ? '暂无终端输出。可点击「新建」启动本地交互 Shell，或等待 Grok Agent 创建 terminal/*。'
                : '选择上方终端标签以查看输出。')}
            {terminal?.truncated && <><br /><br /><b>输出已截断</b></>}
          </div>
          <form
            className="terminal-input-bar"
            onSubmit={(event) => {
              event.preventDefault()
              void sendTerminalLine()
            }}
          >
            <span className="terminal-input-prompt" aria-hidden="true">{canWriteTerminal ? '›' : '·'}</span>
            <input
              aria-label="终端输入"
              className="terminal-input"
              value={terminalInput}
              onChange={(event) => setTerminalInput(event.target.value)}
              placeholder={
                canWriteTerminal
                  ? '输入命令后 Enter 发送到本地终端…'
                  : terminal?.source === 'remote'
                    ? 'Grok 终端为监视模式，不可输入'
                    : '请先「新建」本地交互 Shell'
              }
              disabled={!canWriteTerminal || terminalSending}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="terminal-send"
              aria-label="发送到终端"
              disabled={!canWriteTerminal || terminalSending || !terminalInput.trim()}
            >
              发送
            </button>
          </form>
        </div>
      )}
    </section>
  )
}

function Overlay({
  panel,
  backend,
  workspacePath,
  workspace,
  connected,
  approvalMode,
  autoReconnect,
  theme,
  fontScale,
  preferredModel,
  desktopNotifications,
  shortcuts,
  recordingShortcut,
  taskCount,
  mcpServers,
  tasks,
  activeTaskId,
  replayTaskId,
  onMcpServers,
  onClose,
  onApprovalMode,
  onAutoReconnect,
  onTheme,
  onFontScale,
  onPreferredModel,
  onDesktopNotifications,
  onStartRecordShortcut,
  onResetShortcuts,
  onClearAllTasks,
  onPickCommand,
  onSelectTask,
  onSelectSearchHit,
  onClearTaskSession,
  onForceNewSession,
  onReplayTask,
  onExportReplay,
  profile,
  onProfile,
  onExportAllJson,
  onExportAllMarkdown,
  onResetLayout,
  onImportTasks,
  exportHistory,
  onClearExportHistory,
  onRedownloadExport,
  onRecordExport,
}: {
  panel: OverlayPanel
  backend: BackendStatus | null
  workspacePath: string
  workspace: WorkspaceData | null
  connected: boolean
  approvalMode: ApprovalMode
  autoReconnect: boolean
  theme: ThemeMode
  fontScale: FontScale
  preferredModel: string
  desktopNotifications: boolean
  shortcuts: ShortcutMap
  recordingShortcut: ShortcutId | null
  taskCount: number
  mcpServers: McpServerConfig[]
  tasks: Task[]
  activeTaskId: string
  replayTaskId: string | null
  onMcpServers: (servers: McpServerConfig[]) => void
  onClose: () => void
  onApprovalMode: (mode: ApprovalMode) => void
  onAutoReconnect: (enabled: boolean) => void
  onTheme: (theme: ThemeMode) => void
  onFontScale: (scale: FontScale) => void
  onPreferredModel: (modelId: string) => void
  onDesktopNotifications: (enabled: boolean) => void
  onStartRecordShortcut: (id: ShortcutId) => void
  onResetShortcuts: () => void
  onClearAllTasks: () => void
  onPickCommand: (command: string) => void
  onSelectTask: (taskId: string) => void
  onSelectSearchHit: (hit: GlobalSearchHit) => void
  onClearTaskSession: (taskId: string) => void
  onForceNewSession: (taskId: string) => void
  onExportReplay: (taskId: string) => void
  onReplayTask: (taskId: string | null) => void
  profile: WorkspaceProfile
  onProfile: (profile: WorkspaceProfile) => void
  onExportAllJson: () => void
  onExportAllMarkdown: () => void
  onResetLayout: () => void
  onImportTasks: (raw: string, mode: ImportTasksMode) => { imported: number; skipped: number }
  exportHistory: ExportHistoryEntry[]
  onClearExportHistory: () => void
  onRedownloadExport: (entry: ExportHistoryEntry) => void
  onRecordExport: (entry: {
    kind: ExportHistoryKind
    label: string
    filename: string
    content?: string
    mime?: string
  }) => void
}) {
  const [commandQuery, setCommandQuery] = useState('')
  const [globalQuery, setGlobalQuery] = useState('')
  const [sessionQuery, setSessionQuery] = useState('')
  const [searchHitIndex, setSearchHitIndex] = useState(0)
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [statsRange, setStatsRange] = useState<StatsTimeRange>('all')
  const [searchCopyStatus, setSearchCopyStatus] = useState('')
  const [settingsTab, setSettingsTab] = useState<
    'overview' | 'general' | 'model' | 'shortcuts' | 'mcp' | 'profile' | 'data'
  >('overview')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (panel !== 'commands') setCommandQuery('')
    if (panel !== 'search') {
      setGlobalQuery('')
      setSearchHitIndex(0)
      setSearchCopyStatus('')
    }
    if (panel !== 'sessions') setSessionQuery('')
    if (panel !== 'settings') {
      setImportMessage('')
      setImportError('')
      setSettingsTab('overview')
    }
  }, [panel])

  useEffect(() => {
    setSearchHitIndex(0)
  }, [globalQuery])

  const statsTasks = useMemo(() => filterTasksByStatsRange(tasks, statsRange), [tasks, statsRange])
  const taskStats = useMemo(() => summarizeTaskStats(statsTasks), [statsTasks])
  const taskStatsSummary = useMemo(() => formatTaskStatsSummary(taskStats), [taskStats])
  const globalHits = useMemo(() => searchTasksGlobal(tasks, globalQuery), [tasks, globalQuery])
  const sessionTasks = useMemo(() => filterSessionTasks(tasks, sessionQuery), [tasks, sessionQuery])
  const filteredCommands = useMemo(() => filterSlashCommands(commandQuery), [commandQuery])
  const filteredPaletteTasks = useMemo(() => filterCommandPaletteTasks(tasks, commandQuery), [tasks, commandQuery])

  if (panel === 'none') return null
  const title = panel === 'settings'
    ? '设置'
    : panel === 'extensions'
      ? '扩展中心'
      : panel === 'sessions'
        ? '会话列表'
        : panel === 'search'
          ? '全局搜索'
          : '命令'
  const replayTask = tasks.find((task) => task.id === replayTaskId) ?? null
  const gitReady = Boolean(workspace?.gitAvailable)
  const terminalReady = Boolean(workspace?.terminalAvailable)
  const activeSearchHit = globalHits[Math.min(searchHitIndex, Math.max(0, globalHits.length - 1))] ?? null

  const openSearchHit = (hit: GlobalSearchHit) => {
    onSelectSearchHit(hit)
    onClose()
  }

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (globalHits.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSearchHitIndex((index) => Math.min(globalHits.length - 1, index + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSearchHitIndex((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter' && activeSearchHit) {
      event.preventDefault()
      openSearchHit(activeSearchHit)
    }
  }

  const updateServer = (
    index: number,
    patch: Partial<McpServerConfig> & { argsText?: string; envText?: string },
  ) => {
    const next = mcpServers.map((server, i) => {
      if (i !== index) return server
      const args = patch.argsText !== undefined ? parseArgsInput(patch.argsText) : patch.args ?? server.args
      const env = patch.envText !== undefined ? parseEnvInput(patch.envText) : patch.env ?? server.env
      const { argsText: _argsIgnored, envText: _envIgnored, ...rest } = patch
      return { ...server, ...rest, args, env }
    })
    onMcpServers(next)
  }

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <section
        className={`overlay-panel ${panel === 'settings' ? 'settings-panel' : 'wide'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" className="icon-button" aria-label="关闭面板" onClick={onClose}><X size={16} /></button>
        </header>
        {panel === 'settings' && (
          <div className="settings-shell">
            <nav className="settings-nav" aria-label="设置分类">
              {([
                { id: 'overview', label: '概览' },
                { id: 'general', label: '通用' },
                { id: 'model', label: '模型' },
                { id: 'shortcuts', label: '快捷键' },
                { id: 'mcp', label: 'MCP' },
                { id: 'profile', label: '资料' },
                { id: 'data', label: '数据' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={settingsTab === item.id ? 'active' : ''}
                  aria-current={settingsTab === item.id ? 'page' : undefined}
                  onClick={() => setSettingsTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="settings-content">
              {settingsTab === 'overview' && (
                <div className="settings-pane" aria-label="概览设置">
                  <header className="settings-pane-head">
                    <strong>运行状态</strong>
                    <p>当前环境与工作区信息</p>
                  </header>
                  <div className="settings-kv-grid">
                    <div className="settings-kv"><span>运行模式</span><em>{backend?.mode === 'native' ? '原生桌面' : '浏览器预览'}</em></div>
                    <div className="settings-kv"><span>Grok 版本</span><em>{backend?.version || '未知'}</em></div>
                    <div className="settings-kv"><span>连接状态</span><em className={connected ? 'ok' : ''}>{connected ? '已连接' : '未连接'}</em></div>
                    <div className="settings-kv"><span>本地任务</span><em>{taskCount} 个</em></div>
                    <div className="settings-kv wide"><span>工作区</span><em title={workspacePath || undefined}>{workspacePath || '未选择'}</em></div>
                    <div className="settings-kv"><span>分支</span><em>{workspace?.branch || '未知'}</em></div>
                  </div>

                  <div className="stats-card" aria-label="任务统计">
                    <div className="stats-card-head">
                      <strong>任务统计</strong>
                      <button
                        type="button"
                        aria-label="导出任务统计 Markdown"
                        onClick={() => {
                          const filename = exportTaskStatsFilename(statsRange)
                          const content = exportTaskStatsMarkdown(taskStats, statsRange)
                          downloadTextFile(filename, content)
                          onRecordExport({
                            kind: 'stats',
                            label: `统计 · ${STATS_TIME_RANGE_OPTIONS.find((o) => o.id === statsRange)?.label ?? statsRange}`,
                            filename,
                            content,
                          })
                        }}
                      >
                        导出 MD
                      </button>
                    </div>
                    <div className="stats-range" role="group" aria-label="统计时段">
                      {STATS_TIME_RANGE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={statsRange === option.id ? 'active' : ''}
                          aria-pressed={statsRange === option.id}
                          onClick={() => setStatsRange(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <small>{taskStatsSummary}</small>
                    <div className="stats-grid">
                      <span>活跃 <em>{taskStats.active}</em></span>
                      <span>归档 <em>{taskStats.archived}</em></span>
                      <span>置顶 <em>{taskStats.pinned}</em></span>
                      <span>执行中 <em>{taskStats.running}</em></span>
                      <span>已完成 <em>{taskStats.done}</em></span>
                      <span>就绪 <em>{taskStats.idle}</em></span>
                      <span>消息 <em>{taskStats.messages}</em></span>
                      <span>标签种数 <em>{taskStats.tags}</em></span>
                    </div>
                    {taskStats.topTags.length > 0 && (
                      <div className="stats-tags" aria-label="热门标签">
                        {taskStats.topTags.map((item) => (
                          <em key={item.tag}>#{item.tag} · {item.count}</em>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {settingsTab === 'general' && (
                <div className="settings-pane" aria-label="通用设置">
                  <header className="settings-pane-head">
                    <strong>通用</strong>
                    <p>外观、连接与通知偏好</p>
                  </header>
                  <div className="settings-group">
                    <div className="setting-row">
                      <div className="setting-copy">
                        <span>主题</span>
                      </div>
                      <div className="setting-actions" role="group" aria-label="主题">
                        <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => onTheme('dark')}>深色</button>
                        <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => onTheme('light')}>浅色</button>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <span>字体大小</span>
                        <small>当前 {fontScaleLabel(fontScale)}</small>
                      </div>
                      <div className="setting-actions" role="group" aria-label="字体大小">
                        <button type="button" className={fontScale === 'sm' ? 'active' : ''} onClick={() => onFontScale('sm')}>小</button>
                        <button type="button" className={fontScale === 'md' ? 'active' : ''} onClick={() => onFontScale('md')}>中</button>
                        <button type="button" className={fontScale === 'lg' ? 'active' : ''} onClick={() => onFontScale('lg')}>大</button>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <span>审批模式</span>
                        <small>关键操作前是否等待确认</small>
                      </div>
                      <div className="setting-actions">
                        <button type="button" className={approvalMode === 'approve' ? 'active' : ''} onClick={() => onApprovalMode('approve')}>审批</button>
                        <button type="button" className={approvalMode === 'observe' ? 'active' : ''} onClick={() => onApprovalMode('observe')}>观察</button>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <span>自动连接</span>
                        <small>启动、切工作区、断线时自动重连（最多 5 次）；手动断开后不会再连</small>
                      </div>
                      <div className="setting-actions" role="group" aria-label="自动连接">
                        <button type="button" aria-label="开启自动连接" className={autoReconnect ? 'active' : ''} onClick={() => onAutoReconnect(true)}>开启</button>
                        <button type="button" aria-label="关闭自动连接" className={!autoReconnect ? 'active' : ''} onClick={() => onAutoReconnect(false)}>关闭</button>
                      </div>
                    </div>
                    <div className="setting-row">
                      <div className="setting-copy">
                        <span>桌面通知</span>
                        <small>任务完成、失败与权限请求时推送（需系统授权）</small>
                      </div>
                      <div className="setting-actions" role="group" aria-label="桌面通知">
                        <button type="button" aria-label="开启桌面通知" className={desktopNotifications ? 'active' : ''} onClick={() => onDesktopNotifications(true)}>开启</button>
                        <button type="button" aria-label="关闭桌面通知" className={!desktopNotifications ? 'active' : ''} onClick={() => onDesktopNotifications(false)}>关闭</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'model' && (
                <div className="settings-pane" aria-label="模型设置">
                  <header className="settings-pane-head">
                    <strong>模型</strong>
                    <p>选择默认推理模型 · 当前 {modelLabel(preferredModel)}</p>
                  </header>
                  <div className="model-picker" role="listbox" aria-label="模型选择">
                    {MODEL_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={preferredModel === option.id}
                        className={preferredModel === option.id ? 'active' : ''}
                        onClick={() => onPreferredModel(option.id)}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                  <p className="settings-note">
                    {connected
                      ? '已连接：优先 session/setModel；不支持时记住偏好，下次新建会话注入 _meta.modelId。'
                      : '下次连接时会注入 _meta.modelId。'}
                    {workspace?.gitSource === 'local' ? ' Live Diff 使用本地 git 回退。' : ''}
                  </p>
                </div>
              )}

              {settingsTab === 'shortcuts' && (
                <div className="settings-pane" aria-label="快捷键">
                  <header className="settings-pane-head">
                    <div>
                      <strong>快捷键</strong>
                      <p>点击「录制」后按下新组合键；Esc 取消</p>
                    </div>
                    <button type="button" className="settings-ghost-btn" onClick={onResetShortcuts}>恢复默认</button>
                  </header>
                  <div className="shortcut-section">
                    {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]).map((id) => (
                      <div className="shortcut-row" key={id}>
                        <span>{SHORTCUT_LABELS[id]}</span>
                        <em>{shortcuts[id]}</em>
                        <button
                          type="button"
                          className={recordingShortcut === id ? 'active' : ''}
                          aria-label={`录制快捷键 ${SHORTCUT_LABELS[id]}`}
                          onClick={() => onStartRecordShortcut(id)}
                        >
                          {recordingShortcut === id ? '按下按键…' : '录制'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsTab === 'mcp' && (
                <div className="settings-pane" aria-label="MCP 服务器">
                  <header className="settings-pane-head">
                    <div>
                      <strong>MCP 服务器</strong>
                      <p>下次连接 Grok 时通过 session/new 传入（stdio）</p>
                    </div>
                    <button
                      type="button"
                      className="settings-ghost-btn"
                      onClick={() => onMcpServers([...mcpServers, createEmptyMcpServer()])}
                    >
                      添加
                    </button>
                  </header>
                  <div className="mcp-section">
                    {mcpServers.length === 0 && <div className="empty-conversations">尚未配置 MCP</div>}
                    {mcpServers.map((server, index) => (
                      <div className="mcp-card" key={`mcp-${index}`}>
                        <div className="mcp-card-grid">
                          <label>
                            名称
                            <input
                              aria-label={`MCP 名称 ${index + 1}`}
                              value={server.name}
                              onChange={(event) => updateServer(index, { name: event.target.value })}
                              placeholder="filesystem"
                            />
                          </label>
                          <label>
                            命令
                            <input
                              aria-label={`MCP 命令 ${index + 1}`}
                              value={server.command}
                              onChange={(event) => updateServer(index, { command: event.target.value })}
                              placeholder="npx"
                            />
                          </label>
                          <label className="span-2">
                            参数
                            <input
                              aria-label={`MCP 参数 ${index + 1}`}
                              value={formatArgsInput(server.args)}
                              onChange={(event) => updateServer(index, { argsText: event.target.value })}
                              placeholder="-y @modelcontextprotocol/server-filesystem ."
                            />
                          </label>
                          <label className="span-2">
                            环境变量
                            <textarea
                              aria-label={`MCP 环境变量 ${index + 1}`}
                              value={formatEnvInput(server.env)}
                              onChange={(event) => updateServer(index, { envText: event.target.value })}
                              placeholder={'API_KEY=xxx\nDEBUG=1'}
                              rows={2}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="mcp-remove"
                          aria-label={`删除 MCP ${index + 1}`}
                          onClick={() => onMcpServers(mcpServers.filter((_, i) => i !== index))}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsTab === 'profile' && (
                <div className="settings-pane" aria-label="资料卡设置">
                  <header className="settings-pane-head">
                    <strong>资料卡</strong>
                    <p>连接后自动拉取真实额度；以下为离线时的本地展示</p>
                  </header>
                  <div className="profile-section">
                    <label className="profile-field">
                      显示名称
                      <input
                        aria-label="资料显示名称"
                        value={profile.displayName}
                        onChange={(event) => onProfile({ ...profile, displayName: event.target.value })}
                        placeholder="本地工作区"
                      />
                    </label>
                    <label className="profile-field">
                      套餐标签
                      <input
                        aria-label="资料套餐标签"
                        value={profile.plan}
                        onChange={(event) => onProfile({ ...profile, plan: event.target.value })}
                        placeholder="Local"
                      />
                    </label>
                    <label className="profile-field">
                      额度展示（% · 离线回退）
                      <input
                        aria-label="资料额度百分比"
                        type="number"
                        min={0}
                        max={100}
                        value={profile.usagePercent}
                        onChange={(event) => onProfile({
                          ...profile,
                          usagePercent: Number(event.target.value) || 0,
                        })}
                      />
                    </label>
                  </div>
                </div>
              )}

              {settingsTab === 'data' && (
                <div className="settings-pane" aria-label="数据设置">
                  <header className="settings-pane-head">
                    <strong>数据</strong>
                    <p>导入导出任务、布局与危险操作</p>
                  </header>

                  <div className="export-section" aria-label="导出任务">
                    <div className="settings-block-title">导出 / 导入</div>
                    <p className="settings-note">导出为 JSON / Markdown；可从导出的 JSON 合并或替换导入。</p>
                    <div className="setting-actions export-actions">
                      <button type="button" aria-label="导出全部任务 JSON" onClick={onExportAllJson}>导出 JSON</button>
                      <button type="button" aria-label="导出全部任务 Markdown" onClick={onExportAllMarkdown}>导出 Markdown</button>
                      <button type="button" aria-label="重置面板宽度" onClick={onResetLayout}>重置面板宽度</button>
                    </div>
                    <div className="setting-actions export-actions">
                      <button
                        type="button"
                        aria-label="合并导入任务 JSON"
                        onClick={() => {
                          setImportError('')
                          setImportMessage('')
                          importInputRef.current?.setAttribute('data-mode', 'merge')
                          importInputRef.current?.click()
                        }}
                      >
                        合并导入
                      </button>
                      <button
                        type="button"
                        aria-label="替换导入任务 JSON"
                        onClick={() => {
                          setImportError('')
                          setImportMessage('')
                          importInputRef.current?.setAttribute('data-mode', 'replace')
                          importInputRef.current?.click()
                        }}
                      >
                        替换导入
                      </button>
                    </div>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json"
                      aria-label="选择任务 JSON 文件"
                      className="hidden-file-input"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        const mode = (event.currentTarget.getAttribute('data-mode') as ImportTasksMode | null) ?? 'merge'
                        event.currentTarget.value = ''
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          try {
                            const raw = typeof reader.result === 'string' ? reader.result : ''
                            const result = onImportTasks(raw, mode)
                            setImportMessage(
                              mode === 'replace'
                                ? `已替换导入 ${result.imported} 个任务`
                                : `已合并导入 ${result.imported} 个任务${result.skipped ? `，跳过 ${result.skipped} 个较旧任务` : ''}`,
                            )
                            setImportError('')
                          } catch (error) {
                            setImportError(error instanceof Error ? error.message : String(error))
                            setImportMessage('')
                          }
                        }
                        reader.onerror = () => {
                          setImportError('读取文件失败')
                          setImportMessage('')
                        }
                        reader.readAsText(file)
                      }}
                    />
                    {importMessage && <div className="import-ok" role="status">{importMessage}</div>}
                    {importError && <div className="connection-error" role="alert">{importError}</div>}
                  </div>

                  <div className="export-history" aria-label="最近导出">
                    <div className="mcp-heading">
                      <strong>最近导出</strong>
                      <button type="button" aria-label="清空导出记录" onClick={onClearExportHistory} disabled={exportHistory.length === 0}>
                        清空
                      </button>
                    </div>
                    <p className="settings-note">
                      记录 patch、任务导出与会话回放（本地最多 12 条）。有缓存时可重新下载。
                    </p>
                    {exportHistory.length === 0 && <div className="empty-conversations">暂无导出记录</div>}
                    {exportHistory.map((entry) => (
                      <div className="export-history-row" key={entry.id}>
                        <div>
                          <strong>{entry.label}</strong>
                          <small>
                            {exportHistoryKindLabel(entry.kind)} · {entry.filename}
                          </small>
                        </div>
                        <div className="export-history-actions">
                          <em>{formatExportHistoryTime(entry.at)}</em>
                          {exportHistoryCanRedownload(entry) ? (
                            <button
                              type="button"
                              aria-label={`重新下载 ${entry.filename}`}
                              onClick={() => onRedownloadExport(entry)}
                            >
                              重新下载
                            </button>
                          ) : (
                            <span className="export-history-miss">无缓存</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="settings-danger-zone">
                    <div className="settings-block-title">危险区域</div>
                    <p className="settings-note">清空后不可恢复，请先导出备份。</p>
                    <button type="button" className="danger-action" onClick={onClearAllTasks}>清空全部本地任务</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {panel === 'extensions' && (
          <div className="overlay-body">
            <div className={`extension-card ${connected ? 'ready' : ''}`}>
              <strong>ACP 会话</strong>
              <small>聊天、计划、工具调用、权限审批、fs/*</small>
              <em>{connected ? '可用' : '需连接 Grok'}</em>
            </div>
            <div className={`extension-card ${connected ? 'ready' : ''}`}>
              <strong>fs/read_text_file · fs/write_text_file</strong>
              <small>客户端工作区沙箱读写</small>
              <em>{connected ? '已启用' : '需连接 Grok'}</em>
            </div>
            <div className={`extension-card ${gitReady ? 'ready' : ''}`}>
              <strong>x.ai/git/*</strong>
              <small>实时 Diff 与改动摘要</small>
              <em>
                {connected
                  ? workspace?.gitSource === 'acp'
                    ? '可用'
                    : workspace?.gitSource === 'local'
                      ? '运行时未提供 · 已用本地 git 回退'
                      : '当前运行时未提供 · 本地 git 不可用'
                  : '需连接 Grok'}
              </em>
            </div>
            <div className={`extension-card ${gitReady && workspace?.gitSource === 'local' ? 'ready' : ''}`}>
              <strong>本地 git 回退</strong>
              <small>Tauri 直接读取工作区 status/diff（不依赖 x.ai/git/*）</small>
              <em>
                {connected
                  ? workspace?.gitSource === 'local'
                    ? '生效中'
                    : workspace?.gitSource === 'acp'
                      ? '待命（优先 ACP 扩展）'
                      : '未生效'
                  : '需连接 Grok'}
              </em>
            </div>
            <div className={`extension-card ${terminalReady ? 'ready' : ''}`}>
              <strong>x.ai/terminal/*</strong>
              <small>Grok 侧终端列表与输出</small>
              <em>{connected ? (terminalReady ? '可用' : '当前运行时未提供 · 可用本地 terminal/*') : '需连接 Grok'}</em>
            </div>
            <div className={`extension-card ${connected ? 'ready' : ''}`}>
              <strong>本地 terminal/*</strong>
              <small>客户端创建/输出/终止（ACP 客户端能力）</small>
              <em>{connected ? '已启用' : '需连接 Grok'}</em>
            </div>
            <div className={`extension-card ${connected ? 'ready' : ''}`}>
              <strong>session/setModel</strong>
              <small>连接后即时切换模型</small>
              <em>
                {connected
                  ? '连接后切换时探测；不支持则仅记住偏好'
                  : '需连接 Grok'}
              </em>
            </div>
            <div className={`extension-card ${mcpServers.length > 0 ? 'ready' : ''}`}>
              <strong>MCP</strong>
              <small>session/new 注入的外部工具服务</small>
              <em>{mcpServers.length > 0 ? `${mcpServers.length} 个已配置` : '未配置'}</em>
            </div>
          </div>
        )}
        {panel === 'commands' && (
          <div className="overlay-body">
            <label className="command-search">
              <Search size={14} />
              <input
                aria-label="搜索命令或任务"
                placeholder="搜索命令、描述或任务…"
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                autoFocus
              />
            </label>
            <div className="command-section-label">斜杠命令</div>
            {filteredCommands.length === 0 && <div className="empty-conversations">无匹配命令</div>}
            {filteredCommands.map((item) => (
              <button key={item.command} type="button" className="command-row" onClick={() => onPickCommand(item.command)}>
                <strong>{item.command}</strong>
                <small>{item.description}</small>
              </button>
            ))}
            {filteredPaletteTasks.length > 0 && (
              <>
                <div className="command-section-label">任务</div>
                {filteredPaletteTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="command-row task-row"
                    onClick={() => {
                      onSelectTask(task.id)
                      onClose()
                    }}
                  >
                    <strong>{task.title}</strong>
                    <small>{statusLabel(task.status)} · {task.messages.length} 条消息</small>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {panel === 'search' && (
          <div className="overlay-body">
            <label className="command-search">
              <Search size={14} />
              <input
                aria-label="全局搜索输入"
                placeholder="搜索任务标题、标签或消息…"
                value={globalQuery}
                onChange={(event) => setGlobalQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                autoFocus
              />
            </label>
            <div className="search-toolbar">
              <small className="mcp-hint">
                在全部本地任务中检索标题、标签与消息正文。↑/↓ 选择，Enter 打开；消息结果会跳转并高亮气泡。
              </small>
              <div className="search-toolbar-actions">
                <button
                  type="button"
                  aria-label="复制搜索结果清单"
                  disabled={!globalQuery.trim() || globalHits.length === 0}
                  onClick={() => {
                    const filename = exportSearchHitsFilename(globalQuery)
                    const content = exportSearchHitsMarkdown(globalQuery, globalHits)
                    void (async () => {
                      try {
                        await navigator.clipboard.writeText(content)
                        onRecordExport({
                          kind: 'search-hits-copy',
                          label: `搜索「${globalQuery.trim().slice(0, 24)}」· ${globalHits.length} 条`,
                          filename,
                          content,
                        })
                        setSearchCopyStatus('已复制到剪贴板')
                      } catch (error) {
                        setSearchCopyStatus(error instanceof Error ? `复制失败：${error.message}` : '复制失败')
                      }
                    })()
                  }}
                >
                  复制清单
                </button>
                <button
                  type="button"
                  aria-label="导出搜索结果清单"
                  disabled={!globalQuery.trim() || globalHits.length === 0}
                  onClick={() => {
                    const filename = exportSearchHitsFilename(globalQuery)
                    const content = exportSearchHitsMarkdown(globalQuery, globalHits)
                    downloadTextFile(filename, content)
                    onRecordExport({
                      kind: 'search-hits',
                      label: `搜索「${globalQuery.trim().slice(0, 24)}」· ${globalHits.length} 条`,
                      filename,
                      content,
                    })
                    setSearchCopyStatus('')
                  }}
                >
                  导出清单
                </button>
              </div>
            </div>
            {searchCopyStatus && (
              <div className="import-ok" role="status" aria-live="polite">{searchCopyStatus}</div>
            )}
            {!globalQuery.trim() && <div className="empty-conversations">输入关键词开始搜索</div>}
            {globalQuery.trim() && globalHits.length === 0 && (
              <div className="empty-conversations">没有匹配结果</div>
            )}
            <div className="search-results" aria-label="搜索结果" role="listbox">
              {globalHits.map((hit, index) => {
                const selected = index === Math.min(searchHitIndex, globalHits.length - 1)
                return (
                  <button
                    key={`${hit.taskId}-${hit.kind}-${hit.messageIndex ?? 'x'}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`search-hit${selected ? ' active' : ''}`}
                    aria-label={
                      hit.kind === 'message' && hit.messageIndex != null
                        ? `跳转到消息 ${hit.messageIndex + 1}：${hit.taskTitle}`
                        : `打开任务 ${hit.taskTitle}`
                    }
                    onMouseEnter={() => setSearchHitIndex(index)}
                    onClick={() => openSearchHit(hit)}
                  >
                    <strong>{hit.taskTitle}</strong>
                    <small>
                      {hit.kind === 'title' ? '标题' : hit.kind === 'tag' ? '标签' : hit.role === 'assistant' ? 'Grok' : hit.role === 'system' ? '系统' : '消息'}
                      {hit.kind === 'message' && hit.messageIndex != null ? ` · #${hit.messageIndex + 1}` : ''}
                    </small>
                    <p>{hit.preview}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {panel === 'sessions' && (
          <div className="overlay-body">
            <div className="session-toolbar">
              <small className="mcp-hint">
                每个任务可绑定一个 ACP session。清除后下次连接将创建新会话；强制新会话会丢弃已保存的 session id。批量导出遵循当前过滤列表。
              </small>
              <button
                type="button"
                aria-label="批量导出会话回放"
                disabled={sessionTasks.length === 0}
                onClick={() => {
                  const filename = exportSessionReplaysFilename(sessionTasks.length)
                  const content = exportSessionReplaysMarkdown(sessionTasks)
                  downloadTextFile(filename, content)
                  onRecordExport({
                    kind: 'replay-batch',
                    label: `${sessionTasks.length} 个会话回放`,
                    filename,
                    content,
                  })
                }}
              >
                批量导出回放
              </button>
            </div>
            <label className="command-search">
              <Search size={14} />
              <input
                aria-label="过滤会话列表"
                placeholder="过滤标题、标签、会话 ID…"
                value={sessionQuery}
                onChange={(event) => setSessionQuery(event.target.value)}
              />
            </label>
            {tasks.length === 0 && <div className="empty-conversations">暂无任务会话</div>}
            {tasks.length > 0 && sessionTasks.length === 0 && (
              <div className="empty-conversations">没有匹配的会话</div>
            )}
            {sessionTasks.map((task) => (
              <div className={`session-card ${task.id === activeTaskId ? 'active' : ''}`} key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {statusLabel(task.status)}
                    {task.acpSessionId ? ` · ${task.acpSessionId}` : ' · 未绑定会话'}
                    {` · ${task.messages.length} 条消息`}
                  </small>
                </div>
                <div className="session-actions">
                  <button type="button" onClick={() => { onSelectTask(task.id); onClose() }}>切换</button>
                  <button type="button" onClick={() => onReplayTask(replayTaskId === task.id ? null : task.id)}>
                    {replayTaskId === task.id ? '收起回放' : '回放'}
                  </button>
                  <button
                    type="button"
                    aria-label={`下载 Markdown ${task.title}`}
                    onClick={() => onExportReplay(task.id)}
                  >
                    导出
                  </button>
                  <button type="button" onClick={() => onClearTaskSession(task.id)} disabled={!task.acpSessionId}>清除绑定</button>
                  <button type="button" className="danger" onClick={() => onForceNewSession(task.id)}>强制新会话</button>
                </div>
                {replayTask?.id === task.id && (
                  <div className="session-replay" aria-label={`回放 ${task.title}`}>
                    {task.planSteps.length > 0 && (
                      <div className="replay-plan">
                        <strong>执行计划</strong>
                        <ol>
                          {task.planSteps.map((step, index) => (
                            <li key={`${step.content}-${index}`}>
                              <span className={`replay-status ${step.status}`}>{statusLabel(step.status === 'completed' ? 'done' : step.status === 'in_progress' ? 'running' : 'idle')}</span>
                              {step.content}
                              {step.detail && <em> · {step.detail}</em>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <div className="replay-messages">
                      <strong>消息时间线</strong>
                      {task.messages.length === 0 && <small>暂无消息</small>}
                      {task.messages.map((message, index) => (
                        <div className={`replay-message ${message.role}`} key={`${message.role}-${index}`}>
                          <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'Grok' : '系统'}</span>
                          <p>{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

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
  const [reviewOpen, setReviewOpen] = useState(true)
  const [connected, setConnected] = useState(false)
  const [overlay, setOverlay] = useState<OverlayPanel>('none')
  const [backend, setBackend] = useState<BackendStatus | null>(null)
  const [commandDraft, setCommandDraft] = useState('')
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => loadMcpServers())
  const [autoReconnect, setAutoReconnect] = useState(() => loadAutoReconnect())
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
  const [replayTaskId, setReplayTaskId] = useState<string | null>(null)
  const [highlightMessageIndex, setHighlightMessageIndex] = useState<number | null>(null)
  const refreshWorkspaceRef = useRef<() => void>(() => undefined)

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0]

  const selectTask = useCallback((taskId: string, messageIndex?: number) => {
    setActiveTaskId(taskId)
    setHighlightMessageIndex(typeof messageIndex === 'number' ? messageIndex : null)
  }, [])

  const selectSearchHit = useCallback((hit: GlobalSearchHit) => {
    setActiveTaskId(hit.taskId)
    setHighlightMessageIndex(
      hit.kind === 'message' && typeof hit.messageIndex === 'number' ? hit.messageIndex : null,
    )
  }, [])

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

  const createNewTask = useCallback(() => {
    const task = createTask()
    setTasks((current) => [task, ...current])
    setActiveTaskId(task.id)
    setHighlightMessageIndex(null)
    setSearch('')
  }, [])

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
        setReviewOpen(true)
        return
      }
      if (eventMatchesShortcut(event, shortcuts.toggleTheme)) {
        event.preventDefault()
        changeTheme(theme === 'dark' ? 'light' : 'dark')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeTaskId, createNewTask, recordingShortcut, shortcuts, theme, changeTheme, togglePinTask, toggleArchiveTask])

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

      const planSteps = patch.mergeTool
        ? mergeToolIntoPlan(patch.planSteps ?? task.planSteps, patch.mergeTool)
        : patch.planSteps ?? task.planSteps

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
        updatedAt: patch.updatedAt ?? Date.now(),
      }
      delete (next as TaskPatch).appendLiveMessage
      delete (next as TaskPatch).appendLiveThought
      delete (next as TaskPatch).appendLiveEvent
      delete (next as TaskPatch).finalizeAssistant
      delete (next as TaskPatch).appendMessage
      delete (next as TaskPatch).mergeTool
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
      const nextTasks = remaining.length > 0 ? remaining : [createTask()]
      const nextActive = nextTasks.find((task) => task.id === activeTaskId)?.id ?? nextTasks[0].id
      setActiveTaskId(nextActive)
      return nextTasks
    })
  }

  const clearAllTasks = () => {
    const task = createTask()
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
    const payload = parseTaskExportPayload(raw)
    const result = importTasksSnapshot(tasks, activeTaskId, payload, mode)
    setTasks(result.tasks)
    setActiveTaskId(result.activeTaskId)
    return { imported: result.imported, skipped: result.skipped }
  }

  const onSidebarResize = useCallback((deltaX: number) => {
    setLayout((current) => saveLayoutWidths({
      ...current,
      sidebar: clampSidebarWidth(current.sidebar + deltaX),
    }))
  }, [])

  const onReviewResize = useCallback((deltaX: number) => {
    // Dragging the left edge of the review pane: moving right shrinks review.
    setLayout((current) => saveLayoutWidths({
      ...current,
      review: clampReviewWidth(current.review - deltaX),
    }))
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
        onOpenSettings={() => setOverlay('settings')}
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
      <ResizeHandle ariaLabel="调整侧边栏宽度" onDrag={onSidebarResize} />
      <ConversationPane
        task={activeTask}
        workspacePath={workspacePath}
        workspace={workspace}
        approvalMode={approvalMode}
        onApprovalMode={changeApprovalMode}
        onWorkspacePath={updateWorkspacePath}
        onWorkspaceData={setWorkspace}
        onOpenReview={() => setReviewOpen(true)}
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
        preferredModel={preferredModel}
        desktopNotifications={desktopNotifications}
        shortcuts={shortcuts}
        highlightMessageIndex={highlightMessageIndex}
        onHighlightConsumed={() => setHighlightMessageIndex(null)}
      />
      {reviewOpen && (
        <>
          <ResizeHandle ariaLabel="调整审阅面板宽度" onDrag={onReviewResize} />
          <ReviewPane
            workspace={workspace}
            workspacePath={workspacePath}
            connected={connected}
            onClose={() => setReviewOpen(false)}
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
      <Overlay
        panel={overlay}
        backend={backend}
        workspacePath={workspacePath}
        workspace={workspace}
        connected={connected}
        approvalMode={approvalMode}
        autoReconnect={autoReconnect}
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
        onClose={() => setOverlay('none')}
        onApprovalMode={changeApprovalMode}
        onAutoReconnect={changeAutoReconnect}
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
      />
    </div>
  )
}
