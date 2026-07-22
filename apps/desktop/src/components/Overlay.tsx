import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { BackendStatus } from '../lib/desktopBridge'
import { copyText } from '../lib/clipboard'
import { MarkdownView } from '../lib/MarkdownView'
import type { Account, AccountsState } from '../lib/accounts'

type OverlayProps = {
  accounts: AccountsState
  currentAccount: Account | null
  addImportedAccount: (name: string, raw: string) => Promise<Account>
  addBrowserAccount: (name: string) => Promise<Account>
  switchAccount: (accountId: string) => Promise<boolean>
  deleteAccount: (accountId: string) => Promise<void>
  // other props from existing type
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
  onOpenMcpSettings?: () => void
  settingsInitialTab?: 'overview' | 'general' | 'model' | 'shortcuts' | 'mcp' | 'profile' | 'data' | 'accounts' | null
}
import {
  type ApprovalMode,
  type FontScale,
  type Task,
  type ThemeMode,
  MODEL_OPTIONS,
  SLASH_COMMANDS,
  downloadTextFile,
  exportSearchHitsFilename,
  exportSearchHitsMarkdown,
  exportSessionReplaysFilename,
  exportSessionReplaysMarkdown,
  exportTaskStatsFilename,
  exportTaskStatsMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  filterCommandPaletteTasks,
  filterSessionTasks,
  filterSlashCommands,
  fontScaleLabel,
  formatStepDuration,
  filterTasksByStatsRange,
  formatTaskStatsSummary,
  modelLabel,
  searchTasksGlobal,
  statusLabel,
  STATS_TIME_RANGE_OPTIONS,
  summarizeTaskStats,
  type GlobalSearchHit,
  type ImportTasksMode,
  type StatsTimeRange,
} from '../lib/tasks'
import {
  type ExportHistoryEntry,
  type ExportHistoryKind,
  type ShortcutId,
  type ShortcutMap,
  type WorkspaceProfile,
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  exportHistoryCanRedownload,
  exportHistoryKindLabel,
  formatExportHistoryTime,
  profileInitials,
} from '../lib/prefs'
import {
  type McpServerConfig,
  MCP_TEMPLATES,
  applyMcpTemplate,
  createEmptyMcpServer,
  formatArgsInput,
  formatEnvInput,
  parseArgsInput,
  parseEnvInput,
} from '../lib/mcp'
import type { WorkspaceData } from '../lib/grokAcpClient'
import type { OverlayPanel } from './types'
import { BrandMark } from './BrandMark'

export function Overlay({
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
  onOpenMcpSettings,
  settingsInitialTab = null,
  accounts,
  currentAccount,
  addImportedAccount,
  addBrowserAccount,
  switchAccount,
  deleteAccount,
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
  onOpenMcpSettings?: () => void
  settingsInitialTab?: 'overview' | 'general' | 'model' | 'shortcuts' | 'mcp' | 'profile' | 'data' | 'accounts' | null
  accounts: AccountsState
  currentAccount: Account | null
  addImportedAccount: (name: string, raw: string) => Promise<Account>
  addBrowserAccount: (name: string) => Promise<Account>
  switchAccount: (accountId: string) => Promise<boolean>
  deleteAccount: (accountId: string) => Promise<void>
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
    'overview' | 'general' | 'model' | 'shortcuts' | 'mcp' | 'profile' | 'data' | 'accounts'
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
    } else if (settingsInitialTab) {
      setSettingsTab(settingsInitialTab)
    }
  }, [panel, settingsInitialTab])

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
      ? '能力诊断'
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
                { id: 'accounts', label: '账号' },
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

              {settingsTab === 'accounts' && (
                <div className="settings-pane" aria-label="账号设置">
                  <header className="settings-pane-head">
                    <strong>多账号管理</strong>
                    <p>每个账号使用独立凭据文件；只有完整 OIDC 凭据可以自动续期。</p>
                  </header>

                  <div className="accounts-list">
                    {accounts.accounts.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon">👤</div>
                        <p>暂无账号，请添加。</p>
                        <button type="button" onClick={() => setSettingsTab('overview')} className="empty-add-btn">
                          去添加账号
                        </button>
                      </div>
                    ) : (
                      accounts.accounts.map((acc: Account) => (
                        <div
                          key={acc.id}
                          className={`account-card ${acc.id === currentAccount?.id ? 'active' : ''}`}
                          onClick={() => { void switchAccount(acc.id) }}
                        >
                          <div className="account-header">
                            <div className="account-name">
                              <strong>{acc.name}</strong>
                              {acc.id === currentAccount?.id && <span className="current-badge">★ 当前</span>}
                            </div>
                            <span className="account-type">
                              {acc.source === 'browser-oidc' ? '浏览器 OIDC' : acc.source === 'legacy-global' ? '默认旧账号' : '导入'}
                            </span>
                          </div>
                          <div className="account-info">
                            <span>续期：{acc.renewal === 'refreshable' ? '可自动续期' : acc.renewal === 'non-refreshable' ? '到期后需重新登录' : '待检查'}</span>
                            <span>状态：{{
                              unknown: '待检查',
                              valid: '可用',
                              refreshing: '续期中',
                              'temporarily-unavailable': '暂时不可用',
                              'relogin-required': '需要重新登录',
                            }[acc.authStatus]}</span>
                            <span>最后使用：{new Date(acc.lastUsedAt).toLocaleString()}</span>
                            <span>关联任务：{tasks.filter((task) => task.accountId === acc.id).length}</span>
                          </div>
                          <div className="account-actions">
                            <button type="button" onClick={(e) => { e.stopPropagation(); void switchAccount(acc.id); }}>
                              切换
                            </button>
                            {acc.id === currentAccount?.id && acc.authStatus === 'relogin-required' && (
                              <button type="button" onClick={(e) => {
                                e.stopPropagation()
                                window.dispatchEvent(new CustomEvent('grok-forge-oidc-login'))
                              }}>
                                重新登录
                              </button>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); void deleteAccount(acc.id).catch((error) => setImportError(error instanceof Error ? error.message : String(error))); }} className="danger">
                              删除
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="add-account-section">
                    <button
                      type="button"
                      className="add-btn primary"
                      onClick={() => {
                        setImportError('')
                        void addBrowserAccount(`浏览器账号 ${new Date().toLocaleDateString()}`)
                          .catch((error) => setImportError(error instanceof Error ? error.message : String(error)))
                      }}
                    >
                      <span className="icon">➕</span> 标准浏览器 OIDC 登录
                    </button>
                    <button
                      type="button"
                      className="add-btn"
                      onClick={() => {
                        let raw = prompt('粘贴凭据 JSON。完整续期包需包含 access_token、refresh_token、expires_at、issuer、client_id：') ?? ''
                        if (!raw.trim()) return
                        setImportError('')
                        void addImportedAccount(`导入账号 ${new Date().toLocaleDateString()}`, raw)
                          .catch((error) => setImportError(error instanceof Error ? error.message : String(error)))
                          .finally(() => { raw = '' })
                      }}
                    >
                      <span className="icon">➕</span> 通过导入添加
                    </button>
                    {importError && <div className="import-error" role="alert">{importError}</div>}
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
            <p className="capability-hint">
              查看当前运行时能力与 MCP 配置。模板添加后下次连接 Grok 生效；也可在设置 → MCP 中细调。
            </p>
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

            <div className="capability-actions">
              <button
                type="button"
                aria-label="打开 MCP 设置"
                onClick={() => onOpenMcpSettings?.()}
              >
                打开 MCP 设置
              </button>
            </div>

            <div className="mcp-template-list" aria-label="MCP 模板">
              <div className="command-section-label">MCP 模板（一键添加）</div>
              {MCP_TEMPLATES.map((template) => {
                const already = mcpServers.some(
                  (server) => server.name.trim().toLowerCase() === template.name.toLowerCase(),
                )
                return (
                  <div className="mcp-template-card" key={template.id}>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                    <button
                      type="button"
                      aria-label={already ? `已添加 ${template.name}` : `添加 MCP 模板 ${template.name}`}
                      disabled={already}
                      onClick={() => {
                        const result = applyMcpTemplate(mcpServers, template)
                        if (result.added) onMcpServers(result.servers)
                      }}
                    >
                      {already ? '已添加' : '添加'}
                    </button>
                  </div>
                )
              })}
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
                          {task.planSteps.map((step, index) => {
                            const duration = formatStepDuration(step)
                            return (
                              <li key={`${step.content}-${index}`}>
                                <span className={`replay-status ${step.status}`}>{statusLabel(step.status === 'completed' ? 'done' : step.status === 'in_progress' ? 'running' : 'idle')}</span>
                                {step.content}
                                {step.detail && <em> · {step.detail}</em>}
                                {duration && <em> · {duration}</em>}
                              </li>
                            )
                          })}
                        </ol>
                      </div>
                    )}
                    <div className="replay-messages">
                      <strong>消息时间线</strong>
                      {task.messages.length === 0 && <small>暂无消息</small>}
                      {task.messages.map((message, index) => (
                        <div className={`replay-message ${message.role}`} key={`${message.role}-${index}`}>
                          <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'Grok' : '系统'}</span>
                          <MarkdownView source={message.content} className="md-agent" />
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
