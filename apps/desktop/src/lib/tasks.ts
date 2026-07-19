import type { AcpUiEvent } from './desktopBridge'

export type TaskStatus = 'idle' | 'running' | 'done'
export type ApprovalMode = 'approve' | 'observe'
export type MessageRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  role: MessageRole
  content: string
}

export type PlanStep = {
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  detail?: string
  toolCallId?: string
  startedAt?: number
  finishedAt?: number
}

export type Task = {
  id: string
  title: string
  messages: ChatMessage[]
  liveMessage: string
  /** Streaming agent thought chunks, concatenated into one block (not one row per token). */
  liveThought: string
  liveEvents: unknown[]
  planSteps: PlanStep[]
  status: TaskStatus
  updatedAt: number
  sessionKey?: string
  /** ACP session id from the last successful session/new or session/load */
  acpSessionId?: string
  attachments?: string[]
  /** User-defined labels for grouping / filtering */
  tags?: string[]
  /** When true, task stays at the top of the sidebar list */
  pinned?: boolean
  /** When true, task is archived/hidden from the default sidebar list */
  archived?: boolean
}

export type TaskSnapshot = {
  tasks: Task[]
  activeTaskId: string
}

const TASKS_KEY = 'grok-forge-tasks'
const ACTIVE_KEY = 'grok-forge-active-task'
const MODE_KEY = 'grok-forge-approval-mode'
const WORKSPACES_KEY = 'grok-forge-workspaces'
const AUTO_RECONNECT_KEY = 'grok-forge-auto-reconnect'
const THEME_KEY = 'grok-forge-theme'
const FONT_SCALE_KEY = 'grok-forge-font-scale'
const MODEL_KEY = 'grok-forge-model'

export type ThemeMode = 'dark' | 'light'
export type FontScale = 'sm' | 'md' | 'lg'

export type ModelOption = {
  id: string
  label: string
  description: string
}

/** Built-in model choices shown in Settings (ids match Grok ACP modelId). */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'grok-build', label: 'Grok Build', description: '默认编程与代理工作流' },
  { id: 'grok-4.5', label: 'Grok 4.5', description: '最新智能体能力' },
  { id: 'grok-4', label: 'Grok 4', description: '通用旗舰' },
  { id: 'grok-3-fast', label: 'Grok 3 Fast', description: '更快响应' },
]

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id

export function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ChatMessage[] => {
    if (typeof entry === 'string' && entry.trim()) {
      return [{ role: 'user', content: entry }]
    }
    if (entry === null || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const content = typeof row.content === 'string' ? row.content.trim() : ''
    if (!content) return []
    const role = row.role === 'assistant' || row.role === 'system' ? row.role : 'user'
    return [{ role, content }]
  })
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const tag = item.trim().replace(/\s+/g, ' ').slice(0, 24)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= 12) break
  }
  return tags
}

export function createTask(partial?: Partial<Task> & { messages?: unknown }): Task {
  const now = Date.now()
  const id = partial?.id ?? `task-${now}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    title: partial?.title ?? '准备开始',
    messages: normalizeMessages(partial?.messages),
    liveMessage: partial?.liveMessage ?? '',
    liveThought: partial?.liveThought ?? '',
    liveEvents: partial?.liveEvents ?? [],
    planSteps: partial?.planSteps ?? [],
    status: partial?.status ?? 'idle',
    updatedAt: partial?.updatedAt ?? now,
    sessionKey: partial?.sessionKey ?? id,
    acpSessionId: partial?.acpSessionId,
    attachments: partial?.attachments ?? [],
    tags: normalizeTags(partial?.tags),
    pinned: Boolean(partial?.pinned),
    archived: Boolean(partial?.archived),
  }
}

/** Active tasks first (pinned then recent); archived tasks sink to the bottom. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const archived = Number(Boolean(a.archived)) - Number(Boolean(b.archived))
    if (archived !== 0) return archived
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    if (pin !== 0) return pin
    return b.updatedAt - a.updatedAt
  })
}

export function toggleTaskPinned(task: Task): Task {
  return { ...task, pinned: !task.pinned, updatedAt: Date.now() }
}

/** Archive hides a task from the default list; unarchive restores it. */
export function toggleTaskArchived(task: Task): Task {
  const nextArchived = !task.archived
  return {
    ...task,
    archived: nextArchived,
    // Archiving clears pin so it does not reappear as a sticky ghost.
    pinned: nextArchived ? false : task.pinned,
    updatedAt: Date.now(),
  }
}

export function countArchivedTasks(tasks: Task[]) {
  return tasks.filter((task) => task.archived).length
}

export type TaskStats = {
  total: number
  active: number
  archived: number
  pinned: number
  idle: number
  running: number
  done: number
  messages: number
  tags: number
  topTags: Array<{ tag: string; count: number }>
}

/** Time window for filtering task stats by `updatedAt`. */
export type StatsTimeRange = 'all' | 'today' | '7d' | '30d'

export const STATS_TIME_RANGE_OPTIONS: Array<{ id: StatsTimeRange; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'today', label: '今日' },
  { id: '7d', label: '7 天' },
  { id: '30d', label: '30 天' },
]

export function statsTimeRangeStart(range: StatsTimeRange, now = Date.now()): number | null {
  if (range === 'all') return null
  if (range === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.getTime()
  }
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  return now - 30 * 24 * 60 * 60 * 1000
}

/** Keep tasks whose `updatedAt` falls within the selected stats window. */
export function filterTasksByStatsRange(tasks: Task[], range: StatsTimeRange, now = Date.now()): Task[] {
  const start = statsTimeRangeStart(range, now)
  if (start == null) return tasks
  return tasks.filter((task) => task.updatedAt >= start)
}

/** Aggregate counts for the settings / sidebar stats card. */
export function summarizeTaskStats(tasks: Task[]): TaskStats {
  let archived = 0
  let pinned = 0
  let idle = 0
  let running = 0
  let done = 0
  let messages = 0
  const tagCounts = new Map<string, { tag: string; count: number }>()

  for (const task of tasks) {
    if (task.archived) archived += 1
    else if (task.pinned) pinned += 1
    if (task.status === 'running') running += 1
    else if (task.status === 'done') done += 1
    else idle += 1
    messages += task.messages.length
    for (const tag of task.tags ?? []) {
      const key = tag.toLowerCase()
      const current = tagCounts.get(key)
      if (current) current.count += 1
      else tagCounts.set(key, { tag, count: 1 })
    }
  }

  const topTags = [...tagCounts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'))
    .slice(0, 5)

  return {
    total: tasks.length,
    active: tasks.length - archived,
    archived,
    pinned,
    idle,
    running,
    done,
    messages,
    tags: tagCounts.size,
    topTags,
  }
}

export function formatTaskStatsSummary(stats: TaskStats) {
  const parts = [
    `共 ${stats.total} 个任务`,
    `活跃 ${stats.active}`,
    `归档 ${stats.archived}`,
    `置顶 ${stats.pinned}`,
    `执行中 ${stats.running}`,
    `消息 ${stats.messages}`,
  ]
  if (stats.topTags.length > 0) {
    parts.push(`标签 ${stats.topTags.map((item) => `#${item.tag}`).join(' ')}`)
  }
  return parts.join(' · ')
}

export function statsTimeRangeLabel(range: StatsTimeRange) {
  return STATS_TIME_RANGE_OPTIONS.find((option) => option.id === range)?.label ?? range
}

/** Markdown report for the settings stats card (respects the selected time window). */
export function exportTaskStatsMarkdown(stats: TaskStats, range: StatsTimeRange = 'all', now = Date.now()) {
  const lines: string[] = [
    '# 任务统计',
    '',
    `- 时段：${statsTimeRangeLabel(range)}`,
    `- 导出时间：${new Date(now).toISOString()}`,
    '',
    '## 摘要',
    '',
    formatTaskStatsSummary(stats),
    '',
    '## 明细',
    '',
    '| 指标 | 数量 |',
    '| --- | ---: |',
    `| 总数 | ${stats.total} |`,
    `| 活跃 | ${stats.active} |`,
    `| 归档 | ${stats.archived} |`,
    `| 置顶 | ${stats.pinned} |`,
    `| 执行中 | ${stats.running} |`,
    `| 已完成 | ${stats.done} |`,
    `| 就绪 | ${stats.idle} |`,
    `| 消息 | ${stats.messages} |`,
    `| 标签种数 | ${stats.tags} |`,
    '',
  ]
  if (stats.topTags.length > 0) {
    lines.push('## 热门标签', '')
    for (const item of stats.topTags) {
      lines.push(`- #${item.tag} · ${item.count}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function exportTaskStatsFilename(range: StatsTimeRange = 'all', now = Date.now()) {
  const stamp = new Date(now).toISOString().slice(0, 10)
  return `grok-stats-${range}-${stamp}.md`
}

export function loadTaskSnapshot(): TaskSnapshot {
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    const parsed = raw ? JSON.parse(raw) as Task[] : []
    const tasks = Array.isArray(parsed) && parsed.length > 0
      ? parsed.map((task) => createTask(task))
      : [createTask()]
    const activeTaskId = localStorage.getItem(ACTIVE_KEY) ?? tasks[0].id
    const activeExists = tasks.some((task) => task.id === activeTaskId)
    return { tasks, activeTaskId: activeExists ? activeTaskId : tasks[0].id }
  } catch {
    const task = createTask()
    return { tasks: [task], activeTaskId: task.id }
  }
}

/** Drop oversized data-URL attachments before persisting so localStorage quota is not blown. */
function sanitizeTasksForStorage(tasks: Task[]): Task[] {
  const maxDataUrlChars = 120_000
  return tasks.map((task) => {
    const attachments = (task.attachments ?? []).flatMap((item) => {
      if (!item.startsWith('data:') || item.length <= maxDataUrlChars) return [item]
      return []
    })
    if (attachments.length === (task.attachments ?? []).length) return task
    return { ...task, attachments }
  })
}

export function saveTaskSnapshot(snapshot: TaskSnapshot) {
  try {
    const tasks = sanitizeTasksForStorage(snapshot.tasks)
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
    localStorage.setItem(ACTIVE_KEY, snapshot.activeTaskId)
  } catch {
    // QuotaExceeded or private mode — keep UI state; next successful save will retry.
    try {
      localStorage.setItem(ACTIVE_KEY, snapshot.activeTaskId)
    } catch {
      // ignore
    }
  }
}

export function loadApprovalMode(): ApprovalMode {
  return localStorage.getItem(MODE_KEY) === 'observe' ? 'observe' : 'approve'
}

export function saveApprovalMode(mode: ApprovalMode) {
  localStorage.setItem(MODE_KEY, mode)
}

/** Default ON so the app connects to Grok as soon as a workspace is ready. */
export function loadAutoReconnect(): boolean {
  const value = localStorage.getItem(AUTO_RECONNECT_KEY)
  if (value === null) return true
  return value === '1'
}

export function saveAutoReconnect(enabled: boolean) {
  localStorage.setItem(AUTO_RECONNECT_KEY, enabled ? '1' : '0')
}

export function loadTheme(): ThemeMode {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function saveTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_KEY, theme)
}

export function loadFontScale(): FontScale {
  const value = localStorage.getItem(FONT_SCALE_KEY)
  if (value === 'sm' || value === 'lg') return value
  return 'md'
}

export function saveFontScale(scale: FontScale) {
  localStorage.setItem(FONT_SCALE_KEY, scale)
}

export function loadPreferredModel(): string {
  const value = localStorage.getItem(MODEL_KEY)?.trim()
  if (!value) return DEFAULT_MODEL_ID
  return value
}

export function savePreferredModel(modelId: string) {
  localStorage.setItem(MODEL_KEY, modelId.trim() || DEFAULT_MODEL_ID)
}

export function modelLabel(modelId: string) {
  return MODEL_OPTIONS.find((item) => item.id === modelId)?.label ?? modelId
}

export function fontScaleLabel(scale: FontScale) {
  if (scale === 'sm') return '小'
  if (scale === 'lg') return '大'
  return '中'
}

/** Apply theme + font scale to the document root for CSS hooks. */
export function applyAppearance(theme: ThemeMode, fontScale: FontScale) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.font = fontScale
  root.style.colorScheme = theme
}

export function loadWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export function rememberWorkspace(path: string, existing = loadWorkspaces()) {
  const next = [path, ...existing.filter((item) => item !== path)].slice(0, 8)
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(next))
  return next
}

export function titleFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return '准备开始'
  return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact
}

export type ListTasksOptions = {
  /** When false (default), archived tasks are omitted. */
  includeArchived?: boolean
}

export function filterTasks(
  tasks: Task[],
  query: string,
  tag?: string | null,
  options: ListTasksOptions = {},
) {
  const needle = query.trim().toLowerCase()
  const tagNeedle = tag?.trim().toLowerCase() ?? ''
  const includeArchived = options.includeArchived === true
  return tasks.filter((task) => {
    if (!includeArchived && task.archived) return false
    if (tagNeedle) {
      const tags = task.tags ?? []
      if (!tags.some((item) => item.toLowerCase() === tagNeedle)) return false
    }
    if (!needle) return true
    return task.title.toLowerCase().includes(needle)
      || (task.tags ?? []).some((item) => item.toLowerCase().includes(needle))
      || task.messages.some((message) => message.content.toLowerCase().includes(needle))
  })
}

/** Filter then pin-aware sort for sidebar / session lists. */
export function listTasks(
  tasks: Task[],
  query = '',
  tag?: string | null,
  options: ListTasksOptions = {},
) {
  return sortTasks(filterTasks(tasks, query, tag, options))
}

/**
 * Filter tasks for the sessions panel by title, ids, session key, or ACP session id.
 * Always returns pin-aware sorted order (includes archived so bindings stay findable).
 */
export function filterSessionTasks(tasks: Task[], query: string) {
  const needle = query.trim().toLowerCase()
  const sorted = listTasks(tasks, '', null, { includeArchived: true })
  if (!needle) return sorted
  return sorted.filter((task) => (
    task.title.toLowerCase().includes(needle)
    || task.id.toLowerCase().includes(needle)
    || (task.sessionKey ?? '').toLowerCase().includes(needle)
    || (task.acpSessionId ?? '').toLowerCase().includes(needle)
    || (task.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
  ))
}

export function collectTaskTags(tasks: Task[]): string[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const task of tasks) {
    for (const tag of task.tags ?? []) {
      const key = tag.toLowerCase()
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { label: tag, count: 1 })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'))
    .map((item) => item.label)
}

export function toggleTaskTag(tags: string[] | undefined, tag: string): string[] {
  const next = normalizeTags(tags)
  const cleaned = tag.trim().replace(/\s+/g, ' ').slice(0, 24)
  if (!cleaned) return next
  const key = cleaned.toLowerCase()
  if (next.some((item) => item.toLowerCase() === key)) {
    return next.filter((item) => item.toLowerCase() !== key)
  }
  return normalizeTags([...next, cleaned])
}

export type GlobalSearchHit = {
  taskId: string
  taskTitle: string
  kind: 'title' | 'tag' | 'message'
  preview: string
  messageIndex?: number
  role?: MessageRole
}

export function globalSearchHitKindLabel(hit: GlobalSearchHit) {
  if (hit.kind === 'title') return '标题'
  if (hit.kind === 'tag') return '标签'
  if (hit.role === 'assistant') return 'Grok'
  if (hit.role === 'system') return '系统'
  return '消息'
}

/** Markdown checklist of global search hits for offline review / handoff. */
export function exportSearchHitsMarkdown(query: string, hits: GlobalSearchHit[], now = Date.now()) {
  const q = query.trim() || '(空)'
  const lines: string[] = [
    `# 搜索结果：${q}`,
    '',
    `- 关键词：\`${q}\``,
    `- 命中：${hits.length}`,
    `- 导出时间：${new Date(now).toISOString()}`,
    '',
    '## 清单',
    '',
  ]
  if (hits.length === 0) {
    lines.push('_无匹配结果_')
  } else {
    hits.forEach((hit, index) => {
      const kind = globalSearchHitKindLabel(hit)
      const msg = hit.kind === 'message' && hit.messageIndex != null ? ` · #${hit.messageIndex + 1}` : ''
      lines.push(`${index + 1}. [ ] **${hit.taskTitle}** — ${kind}${msg}`)
      lines.push(`   - 任务 ID：\`${hit.taskId}\``)
      lines.push(`   - 预览：${hit.preview}`)
      lines.push('')
    })
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function exportSearchHitsFilename(query: string, now = Date.now()) {
  const stamp = new Date(now).toISOString().slice(0, 10)
  const slug = query
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 32)
    .replace(/-+$/g, '') || 'query'
  return `grok-search-${slug}-${stamp}.md`
}

export function searchTasksGlobal(tasks: Task[], query: string, limit = 40): GlobalSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: GlobalSearchHit[] = []
  const sorted = sortTasks(tasks)
  for (const task of sorted) {
    if (hits.length >= limit) break
    if (task.title.toLowerCase().includes(needle)) {
      hits.push({
        taskId: task.id,
        taskTitle: task.title,
        kind: 'title',
        preview: task.title,
      })
    }
    for (const tag of task.tags ?? []) {
      if (hits.length >= limit) break
      if (tag.toLowerCase().includes(needle)) {
        hits.push({
          taskId: task.id,
          taskTitle: task.title,
          kind: 'tag',
          preview: `#${tag}`,
        })
      }
    }
    task.messages.forEach((message, index) => {
      if (hits.length >= limit) return
      const content = message.content
      const at = content.toLowerCase().indexOf(needle)
      if (at < 0) return
      const start = Math.max(0, at - 24)
      const end = Math.min(content.length, at + needle.length + 36)
      const snippet = `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
      hits.push({
        taskId: task.id,
        taskTitle: task.title,
        kind: 'message',
        preview: snippet,
        messageIndex: index,
        role: message.role,
      })
    })
  }
  return hits
}

export function statusLabel(status: TaskStatus) {
  if (status === 'running') return '执行中'
  if (status === 'done') return '已完成'
  return '就绪'
}

export function parsePlanEntries(entries: unknown[]): PlanStep[] {
  return entries.flatMap((value): PlanStep[] => {
    if (typeof value === 'string' && value.trim()) {
      return [{ content: value.trim(), status: 'pending' }]
    }
    if (value === null || typeof value !== 'object') return []
    const entry = value as Record<string, unknown>
    const content = typeof entry.content === 'string'
      ? entry.content
      : typeof entry.text === 'string'
        ? entry.text
        : ''
    if (!content.trim()) return []
    const raw = typeof entry.status === 'string' ? entry.status.toLowerCase() : 'pending'
    const status = raw === 'completed' || raw === 'done'
      ? 'completed'
      : raw === 'in_progress' || raw === 'running'
        ? 'in_progress'
        : raw === 'failed' || raw === 'error'
          ? 'failed'
          : 'pending'
    const detail = typeof entry.detail === 'string'
      ? entry.detail
      : typeof entry.description === 'string'
        ? entry.description
        : undefined
    return [{ content: content.trim(), status, detail }]
  })
}

export function archiveAssistantReply(task: Task): Task {
  const content = task.liveMessage.trim()
  // Always clear the live shell (message, thought, and ephemeral events).
  // Tool/plan history for the turn already lives on planSteps when applicable.
  const base: Task = {
    ...task,
    liveMessage: '',
    liveThought: '',
    liveEvents: [],
    status: 'done',
    updatedAt: Date.now(),
  }
  if (!content) return base
  return {
    ...base,
    messages: [...task.messages, { role: 'assistant', content }],
  }
}

export function mergeToolIntoPlan(steps: PlanStep[], event: Extract<AcpUiEvent, { kind: 'tool' }>): PlanStep[] {
  const now = Date.now()
  const status = event.status === 'completed' || event.status === 'done'
    ? 'completed'
    : event.status === 'failed' || event.status === 'error' || event.status === 'cancelled'
      ? 'failed'
      : event.status === 'in_progress' || event.status === 'running'
        ? 'in_progress'
        : 'pending'
  const detailParts = [
    event.detail,
    event.paths?.length ? event.paths.slice(0, 3).join(', ') : undefined,
    event.toolKind ? `类型 ${event.toolKind}` : undefined,
  ].filter(Boolean)
  const detail = detailParts.join(' · ') || undefined
  const content = event.title || 'Grok tool'

  if (event.toolCallId) {
    const index = steps.findIndex((step) => step.toolCallId === event.toolCallId)
    if (index >= 0) {
      const current = steps[index]
      const next = [...steps]
      next[index] = {
        ...current,
        content: event.title || current.content,
        status,
        detail: detail ?? current.detail,
        finishedAt: status === 'completed' || status === 'failed' ? now : current.finishedAt,
        startedAt: current.startedAt ?? (status === 'in_progress' ? now : undefined),
      }
      return next
    }
  }

  return [
    ...steps,
    {
      content,
      status,
      detail,
      toolCallId: event.toolCallId,
      startedAt: status === 'in_progress' ? now : undefined,
      finishedAt: status === 'completed' || status === 'failed' ? now : undefined,
    },
  ]
}

export function formatStepDuration(step: PlanStep) {
  if (!step.startedAt) return undefined
  const end = step.finishedAt ?? Date.now()
  const seconds = Math.max(1, Math.round((end - step.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${rest}s`
}

export const SLASH_COMMANDS = [
  { command: '/new', description: '创建新任务' },
  { command: '/clear', description: '清空当前对话' },
  { command: '/review', description: '打开变更审阅面板' },
  { command: '/stop', description: '停止当前执行' },
  { command: '/disconnect', description: '断开 Grok 连接' },
  { command: '/help', description: '显示可用命令' },
] as const

export function helpMessage(): ChatMessage {
  return {
    role: 'system',
    content: `可用命令：\n${SLASH_COMMANDS.map((item) => `${item.command} — ${item.description}`).join('\n')}`,
  }
}

export function pickAllowOption(options: Array<{ optionId: string; kind: string }>) {
  return options.find((option) => option.kind === 'allow_always' || option.kind === 'allow_once')
    ?? options.find((option) => option.optionId.includes('allow'))
    ?? options[0]
}

export function pickRejectOption(options: Array<{ optionId: string; kind: string }>) {
  return options.find((option) => option.kind === 'reject_once' || option.kind === 'reject_always')
    ?? options.find((option) => option.optionId.includes('reject') || option.optionId.includes('deny'))
    ?? options[options.length - 1]
}

export function isDataImageAttachment(value: string) {
  return value.startsWith('data:image/')
}

export function isDataTextAttachment(value: string) {
  return value.startsWith('data:text/')
}

export function isDataAttachment(value: string) {
  return value.startsWith('data:')
}

/** Parse `name=...` from a data-URL parameter section (before base64 payload). */
export function dataAttachmentName(value: string): string | null {
  if (!isDataAttachment(value)) return null
  const header = value.slice(0, Math.max(0, value.indexOf(',')))
  const match = /(?:^|;)\s*name=([^;,]*)/i.exec(header)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function attachmentLabel(value: string) {
  const named = dataAttachmentName(value)
  if (named) return named
  if (isDataImageAttachment(value)) {
    const semi = value.indexOf(';')
    const mime = semi > 5 ? value.slice(5, semi) : 'image/png'
    const kind = mime.replace(/^image\//, '') || 'png'
    return `粘贴图片 (${kind})`
  }
  if (isDataTextAttachment(value)) {
    return '拖入文本'
  }
  if (value.startsWith('file:')) {
    try {
      const path = decodeURIComponent(value.replace(/^file:\/\//, ''))
      return path.split(/[\\/]/).filter(Boolean).at(-1) ?? value
    } catch {
      return value
    }
  }
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
}

export function buildAttachmentPrompt(text: string, attachments: string[]) {
  if (attachments.length === 0) return text
  const list = attachments.map((path) => `- ${attachmentLabel(path)}`).join('\n')
  return `${text}\n\n附加上下文文件：\n${list}`
}

export function toResourceBlocks(attachments: string[]) {
  return attachments.map((path) => {
    if (isDataAttachment(path)) {
      const semi = path.indexOf(';')
      const comma = path.indexOf(',')
      const mimeEnd = semi > 5 ? semi : (comma > 5 ? comma : path.length)
      const mime = path.slice(5, mimeEnd) || (isDataImageAttachment(path) ? 'image/png' : 'text/plain')
      const payload = comma >= 0 ? path.slice(comma + 1) : path
      const name = dataAttachmentName(path)
      return {
        type: 'resource' as const,
        resource: {
          uri: name ? `file:///${name.replace(/\\/g, '/')}` : path,
          mimeType: mime.split(';')[0] || mime,
          text: isDataImageAttachment(path) ? payload : (
            (() => {
              try {
                // decode base64 text payload when present
                if (path.includes(';base64,') && typeof atob === 'function') {
                  const binary = atob(payload)
                  try {
                    return decodeURIComponent(escape(binary))
                  } catch {
                    return binary
                  }
                }
              } catch {
                // fall through
              }
              return payload
            })()
          ),
        },
      }
    }
    return {
      type: 'resource' as const,
      resource: {
        uri: path.startsWith('file:') ? path : `file://${path.replace(/\\/g, '/')}`,
        mimeType: 'text/plain',
        text: path,
      },
    }
  })
}

export function fileToDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function utf8ToBase64(text: string) {
  try {
    return btoa(unescape(encodeURIComponent(text)))
  } catch {
    return btoa(text)
  }
}

/** Convert browser/Tauri dropped File objects into attachment refs (path or data URL). */
export async function filesToAttachments(files: ArrayLike<File>): Promise<string[]> {
  const list = Array.from(files)
  const out: string[] = []
  for (const file of list) {
    const nativePath = (file as File & { path?: string }).path
    if (nativePath && nativePath.trim()) {
      out.push(nativePath)
      continue
    }
    if (file.type.startsWith('image/')) {
      const data = await fileToDataUrl(file)
      if (data) out.push(data)
      continue
    }
    // Prefer text-like files as named data URLs so they still work in browser preview.
    const looksText = !file.type
      || file.type.startsWith('text/')
      || file.type.includes('json')
      || file.type.includes('xml')
      || file.type.includes('javascript')
      || file.type.includes('typescript')
      || /\.(md|txt|json|ts|tsx|js|jsx|css|html|yml|yaml|toml|rs|py|go)$/i.test(file.name)
    if (!looksText) continue
    try {
      const text = await file.text()
      const name = encodeURIComponent(file.name || 'dropped.txt')
      out.push(`data:text/plain;name=${name};base64,${utf8ToBase64(text)}`)
    } catch {
      // ignore unreadable files
    }
  }
  return out
}

/** Extract image data-URLs from a clipboard / drag DataTransfer item list. */
export async function readImageAttachmentsFromDataTransfer(
  items: DataTransferItemList | null | undefined,
): Promise<string[]> {
  if (!items || items.length === 0) return []
  const jobs: Array<Promise<string | null>> = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) jobs.push(fileToDataUrl(file))
    }
  }
  const results = await Promise.all(jobs)
  return results.filter((value): value is string => Boolean(value))
}

/** Read any droppable files from a DataTransfer (paths / images / text). */
export async function readAttachmentsFromDataTransfer(
  data: DataTransfer | null | undefined,
): Promise<string[]> {
  if (!data) return []
  if (data.files && data.files.length > 0) {
    return filesToAttachments(data.files)
  }
  return readImageAttachmentsFromDataTransfer(data.items)
}

/** User-facing copy for the reconnect progress toast / pill. */
export function reconnectToastMessage(attempt: number, maxAttempts = 5) {
  const current = Math.min(Math.max(1, attempt), maxAttempts)
  if (attempt > maxAttempts) {
    return `自动重连已达上限（${maxAttempts} 次），请手动连接`
  }
  return `正在自动重连… 第 ${current}/${maxAttempts} 次`
}

/** Delay (ms) used by exponential backoff: 1s, 2s, 4s, 8s… capped at 8s. */
export function reconnectDelayMs(attempt: number) {
  const step = Math.max(1, attempt)
  return Math.min(8_000, 1_000 * (2 ** (step - 1)))
}

/** Export a task's plan + message timeline as Markdown for offline review. */
export function exportTaskReplay(task: Task) {
  const lines: string[] = [
    `# ${task.title}`,
    '',
    `- 状态：${statusLabel(task.status)}`,
    `- 任务 ID：\`${task.id}\``,
  ]
  if (task.pinned) lines.push('- 置顶：是')
  if (task.archived) lines.push('- 归档：是')
  if ((task.tags?.length ?? 0) > 0) lines.push(`- 标签：${task.tags!.map((tag) => `#${tag}`).join(' ')}`)
  if (task.acpSessionId) lines.push(`- ACP 会话：\`${task.acpSessionId}\``)
  lines.push(`- 导出时间：${new Date(task.updatedAt).toISOString()}`, '')

  if (task.planSteps.length > 0) {
    lines.push('## 执行计划', '')
    for (const [index, step] of task.planSteps.entries()) {
      const mark = step.status === 'completed'
        ? 'x'
        : step.status === 'failed'
          ? '!'
          : ' '
      const detail = step.detail ? ` — ${step.detail}` : ''
      lines.push(`${index + 1}. [${mark}] ${step.content}${detail}`)
    }
    lines.push('')
  }

  lines.push('## 消息时间线', '')
  if (task.messages.length === 0) {
    lines.push('_暂无消息_')
  } else {
    for (const message of task.messages) {
      const who = message.role === 'user' ? '你' : message.role === 'assistant' ? 'Grok' : '系统'
      lines.push(`### ${who}`, '', message.content, '')
    }
  }

  if (task.liveThought.trim()) {
    lines.push('## 进行中思考', '', task.liveThought.trim(), '')
  }

  if (task.liveMessage.trim()) {
    lines.push('## 进行中回复', '', task.liveMessage.trim(), '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export function exportTaskReplayFilename(task: Task) {
  const stamp = new Date(task.updatedAt).toISOString().slice(0, 10)
  const slug = task.title
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'task'
  return `grok-replay-${slug}-${stamp}.md`
}

/**
 * Bundle multiple task replays into one Markdown document.
 * Used by the sessions panel “批量导出回放” action (respects the current filter).
 */
export function exportSessionReplaysMarkdown(tasks: Task[], now = Date.now()) {
  const lines: string[] = [
    '# 会话回放批量导出',
    '',
    `- 导出时间：${new Date(now).toISOString()}`,
    `- 任务数：${tasks.length}`,
    '',
  ]
  const sorted = sortTasks(tasks)
  if (sorted.length === 0) {
    lines.push('_暂无会话_')
    return `${lines.join('\n')}\n`
  }
  for (const task of sorted) {
    lines.push(exportTaskReplay(task).trimEnd(), '', '---', '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function exportSessionReplaysFilename(count: number, now = Date.now()) {
  const stamp = new Date(now).toISOString().slice(0, 10)
  const n = Math.max(0, Math.round(count))
  return `grok-replays-${n}-${stamp}.md`
}

/** Trigger a browser download for exported Markdown (no-op friendly for tests). */
export function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Export every local task as a portable JSON snapshot. */
export function exportAllTasksJson(tasks: Task[], activeTaskId?: string) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeTaskId: activeTaskId ?? null,
    taskCount: tasks.length,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      updatedAt: task.updatedAt,
      sessionKey: task.sessionKey,
      acpSessionId: task.acpSessionId,
      attachments: task.attachments ?? [],
      tags: task.tags ?? [],
      pinned: Boolean(task.pinned),
      archived: Boolean(task.archived),
      planSteps: task.planSteps,
      messages: task.messages,
      liveMessage: task.liveMessage,
      liveThought: task.liveThought,
    })),
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/** Export every local task into one Markdown document. */
export function exportAllTasksMarkdown(tasks: Task[]) {
  const stamp = new Date().toISOString()
  const lines: string[] = [
    '# Grok Forge 任务导出',
    '',
    `- 导出时间：${stamp}`,
    `- 任务数：${tasks.length}`,
    '',
  ]
  const sorted = sortTasks(tasks)
  if (sorted.length === 0) {
    lines.push('_暂无任务_')
    return `${lines.join('\n')}\n`
  }
  for (const task of sorted) {
    lines.push(exportTaskReplay(task).trimEnd(), '', '---', '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function exportAllTasksFilename(format: 'json' | 'md' = 'json') {
  const stamp = new Date().toISOString().slice(0, 10)
  return format === 'md' ? `grok-tasks-${stamp}.md` : `grok-tasks-${stamp}.json`
}

export type ImportTasksMode = 'merge' | 'replace'

export type ParsedTaskExport = {
  tasks: Task[]
  activeTaskId?: string
}

export type ImportTasksResult = {
  tasks: Task[]
  activeTaskId: string
  imported: number
  skipped: number
  mode: ImportTasksMode
}

function normalizeImportedTask(value: unknown): Task | null {
  if (value === null || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id.trim()) return null
  const status = row.status === 'running' || row.status === 'done' || row.status === 'idle'
    ? row.status
    : 'idle'
  return createTask({
    id: row.id,
    title: typeof row.title === 'string' && row.title.trim() ? row.title : '导入任务',
    status,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : Date.now(),
    sessionKey: typeof row.sessionKey === 'string' ? row.sessionKey : row.id,
    acpSessionId: typeof row.acpSessionId === 'string' ? row.acpSessionId : undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((item): item is string => typeof item === 'string')
      : [],
    tags: normalizeTags(row.tags),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    messages: normalizeMessages(row.messages),
    liveMessage: typeof row.liveMessage === 'string' ? row.liveMessage : '',
    liveThought: typeof row.liveThought === 'string' ? row.liveThought : '',
    planSteps: Array.isArray(row.planSteps)
      ? row.planSteps.flatMap((step): PlanStep[] => {
          if (step === null || typeof step !== 'object') return []
          const entry = step as Record<string, unknown>
          const content = typeof entry.content === 'string' ? entry.content.trim() : ''
          if (!content) return []
          const raw = typeof entry.status === 'string' ? entry.status : 'pending'
          const stepStatus = raw === 'completed' || raw === 'failed' || raw === 'in_progress' || raw === 'pending'
            ? raw
            : 'pending'
          return [{
            content,
            status: stepStatus,
            detail: typeof entry.detail === 'string' ? entry.detail : undefined,
            toolCallId: typeof entry.toolCallId === 'string' ? entry.toolCallId : undefined,
          }]
        })
      : [],
  })
}

/** Parse a previously exported JSON snapshot (object or bare task array). */
export function parseTaskExportPayload(raw: string | unknown): ParsedTaskExport {
  const value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw
  if (Array.isArray(value)) {
    const tasks = value.map(normalizeImportedTask).filter((task): task is Task => Boolean(task))
    if (tasks.length === 0) throw new Error('导入文件中没有有效任务')
    return { tasks }
  }
  if (value === null || typeof value !== 'object') {
    throw new Error('无法识别的任务导出格式')
  }
  const root = value as Record<string, unknown>
  const list = Array.isArray(root.tasks) ? root.tasks : null
  if (!list) throw new Error('导出文件缺少 tasks 数组')
  const tasks = list.map(normalizeImportedTask).filter((task): task is Task => Boolean(task))
  if (tasks.length === 0) throw new Error('导入文件中没有有效任务')
  const activeTaskId = typeof root.activeTaskId === 'string' ? root.activeTaskId : undefined
  return { tasks, activeTaskId }
}

/**
 * Merge or replace local tasks with an imported snapshot.
 * Merge keeps existing tasks and overwrites same ids; replace discards current list.
 */
export function importTasksSnapshot(
  current: Task[],
  currentActiveId: string,
  payload: ParsedTaskExport,
  mode: ImportTasksMode,
): ImportTasksResult {
  if (payload.tasks.length === 0) {
    throw new Error('导入文件中没有有效任务')
  }

  if (mode === 'replace') {
    const tasks = payload.tasks.map((task) => createTask({
      ...task,
      // Force new ACP binding on replace import to avoid stale remote sessions.
      acpSessionId: undefined,
      sessionKey: task.sessionKey || task.id,
    }))
    const preferred = payload.activeTaskId && tasks.some((task) => task.id === payload.activeTaskId)
      ? payload.activeTaskId
      : tasks[0].id
    return {
      tasks,
      activeTaskId: preferred,
      imported: tasks.length,
      skipped: 0,
      mode,
    }
  }

  const byId = new Map(current.map((task) => [task.id, task]))
  let imported = 0
  let skipped = 0
  for (const incoming of payload.tasks) {
    const existing = byId.get(incoming.id)
    if (existing && existing.updatedAt > incoming.updatedAt) {
      skipped += 1
      continue
    }
    byId.set(incoming.id, createTask({
      ...incoming,
      acpSessionId: existing?.acpSessionId ?? incoming.acpSessionId,
      sessionKey: incoming.sessionKey || incoming.id,
    }))
    imported += 1
  }
  const tasks = sortTasks([...byId.values()])
  const preferred = payload.activeTaskId && tasks.some((task) => task.id === payload.activeTaskId)
    ? payload.activeTaskId
    : currentActiveId && tasks.some((task) => task.id === currentActiveId)
      ? currentActiveId
      : tasks[0].id
  return { tasks, activeTaskId: preferred, imported, skipped, mode }
}

export function filterSlashCommands(
  query: string,
  commands: ReadonlyArray<{ command: string; description: string }> = SLASH_COMMANDS,
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...commands]
  return commands.filter((item) => (
    item.command.toLowerCase().includes(needle)
    || item.description.toLowerCase().includes(needle)
  ))
}

export function filterCommandPaletteTasks(tasks: Task[], query: string, limit = 8) {
  const needle = query.trim().toLowerCase()
  const pool = needle
    ? tasks.filter((task) => (
      task.title.toLowerCase().includes(needle)
      || task.messages.some((message) => message.content.toLowerCase().includes(needle))
      || task.id.toLowerCase().includes(needle)
      || (task.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
    ))
    : [...tasks]
  return sortTasks(pool).slice(0, limit)
}
