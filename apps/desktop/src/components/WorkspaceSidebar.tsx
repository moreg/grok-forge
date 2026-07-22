import { type MouseEvent, memo, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  FolderGit2,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import type { Task } from '../lib/tasks'
import {
  collectTaskTags,
  countArchivedTasks,
  formatTaskStatsSummary,
  listTasks,
  statusLabel,
  summarizeTaskStats,
} from '../lib/tasks'
import {
  formatBillingNextRefreshLabel,
  formatBillingRefreshLabel,
  formatPeriodEndAbsolute,
  formatPeriodRemainingLabel,
  formatUsageLabel,
  periodLabelFromType,
  profileInitials,
  type WorkspaceProfile,
} from '../lib/prefs'
import { BILLING_POLL_INTERVAL_MS, type BillingUsage } from '../lib/grokAcpClient'
import { sidebarTasksEqual } from '../lib/sidebarCompare'

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
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
          {workspacePath ? (
            <div className="workspace-card is-current" aria-label="当前工作区" title={workspacePath}>
              <div className="workspace-icon"><FolderGit2 size={16} /></div>
              <div>
                <strong>{workspaceName}</strong>
                <small>{workspacePath}</small>
              </div>
            </div>
          ) : (
            <button
              className="workspace-card"
              aria-label="选择工作区"
              type="button"
              onClick={onSelectWorkspace}
              title="选择一个本地文件夹作为工作区"
            >
              <div className="workspace-icon"><FolderGit2 size={16} /></div>
              <div>
                <strong>选择工作区</strong>
                <small>点击选择本地文件夹</small>
              </div>
            </button>
          )}
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
        <button type="button" onClick={onOpenExtensions} aria-label="能力诊断"><LayoutGrid size={16} /> 能力诊断</button>
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
}, (prev, next) => (
  prev.workspacePath === next.workspacePath
  && prev.workspaces === next.workspaces
  && prev.connected === next.connected
  && prev.backendVersion === next.backendVersion
  && prev.activeTaskId === next.activeTaskId
  && prev.search === next.search
  && prev.tagFilter === next.tagFilter
  && prev.showArchived === next.showArchived
  && prev.billing === next.billing
  && prev.billingRefreshing === next.billingRefreshing
  && prev.profile === next.profile
  && prev.onSearch === next.onSearch
  && prev.onTagFilter === next.onTagFilter
  && prev.onSelectWorkspace === next.onSelectWorkspace
  && prev.onPickWorkspace === next.onPickWorkspace
  && prev.onNewTask === next.onNewTask
  && prev.onSelectTask === next.onSelectTask
  && prev.onRenameTask === next.onRenameTask
  && prev.onClearTask === next.onClearTask
  && prev.onDeleteTask === next.onDeleteTask
  && prev.onTogglePin === next.onTogglePin
  && prev.onToggleArchive === next.onToggleArchive
  && prev.onShowArchived === next.onShowArchived
  && prev.onOpenSettings === next.onOpenSettings
  && prev.onOpenExtensions === next.onOpenExtensions
  && prev.onOpenSessions === next.onOpenSessions
  && prev.onOpenSearch === next.onOpenSearch
  && prev.onRefreshBilling === next.onRefreshBilling
  && sidebarTasksEqual(prev.tasks, next.tasks)
))
