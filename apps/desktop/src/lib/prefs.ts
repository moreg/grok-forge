export type ShortcutId =
  | 'newTask'
  | 'focusComposer'
  | 'openSettings'
  | 'openReview'
  | 'openSearch'
  | 'togglePin'
  | 'toggleArchive'
  | 'stopTask'
  | 'toggleTheme'

export type ShortcutMap = Record<ShortcutId, string>

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  newTask: '新建任务',
  focusComposer: '聚焦输入框',
  openSettings: '打开设置',
  openReview: '打开审阅面板',
  openSearch: '打开全局搜索',
  togglePin: '置顶/取消置顶当前任务',
  toggleArchive: '归档/取消归档当前任务',
  stopTask: '停止当前执行',
  toggleTheme: '切换深浅主题',
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newTask: 'Ctrl+N',
  focusComposer: 'Ctrl+L',
  openSettings: 'Ctrl+,',
  openReview: 'Ctrl+Shift+R',
  openSearch: 'Ctrl+K',
  togglePin: 'Ctrl+Shift+P',
  toggleArchive: 'Ctrl+Shift+A',
  stopTask: 'Ctrl+Shift+C',
  toggleTheme: 'Ctrl+Shift+T',
}

const SHORTCUTS_KEY = 'grok-forge-shortcuts'
const NOTIFY_KEY = 'grok-forge-desktop-notifications'
const LAYOUT_KEY = 'grok-forge-layout-widths'
const PROFILE_KEY = 'grok-forge-profile'
const EXPORT_HISTORY_KEY = 'grok-forge-export-history'
/** Keep export history short — metadata always; body only when tiny. */
const MAX_EXPORT_HISTORY = 8

export type LayoutWidths = {
  sidebar: number
  review: number
}

export const DEFAULT_LAYOUT: LayoutWidths = {
  sidebar: 244,
  review: 420,
}

export type WorkspaceProfile = {
  displayName: string
  plan: string
  /** Simulated local usage 0–100 for the profile card (not real billing). */
  usagePercent: number
}

export const DEFAULT_PROFILE: WorkspaceProfile = {
  displayName: '本地工作区',
  plan: 'Local',
  usagePercent: 0,
}

export function loadShortcuts(): ShortcutMap {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY)
    if (!raw) return { ...DEFAULT_SHORTCUTS }
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
    const next = { ...DEFAULT_SHORTCUTS }
    for (const key of Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) next[key] = normalizeBinding(value)
    }
    return next
  } catch {
    return { ...DEFAULT_SHORTCUTS }
  }
}

export function saveShortcuts(map: ShortcutMap) {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map))
}

export function resetShortcuts() {
  localStorage.removeItem(SHORTCUTS_KEY)
  return { ...DEFAULT_SHORTCUTS }
}

export function normalizeBinding(binding: string) {
  const parts = binding
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'control' || lower === 'ctrl') return 'Ctrl'
      if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'Meta'
      if (lower === 'alt' || lower === 'option') return 'Alt'
      if (lower === 'shift') return 'Shift'
      if (lower === 'escape' || lower === 'esc') return 'Escape'
      if (lower === ' ') return 'Space'
      if (part.length === 1) return part.toUpperCase()
      return part.length > 1 ? part[0].toUpperCase() + part.slice(1) : part
    })

  const mods = ['Ctrl', 'Meta', 'Alt', 'Shift'].filter((mod) => parts.includes(mod))
  const key = parts.find((part) => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(part))
  return key ? [...mods, key].join('+') : mods.join('+')
}

export function bindingFromEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push(event.metaKey && !event.ctrlKey ? 'Meta' : 'Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  let key = event.key
  if (key === ' ') key = 'Space'
  if (key.length === 1) key = key.toUpperCase()
  if (key === 'Esc') key = 'Escape'
  parts.push(key)
  return normalizeBinding(parts.join('+'))
}

export function eventMatchesShortcut(event: KeyboardEvent, binding: string): boolean {
  const expected = normalizeBinding(binding)
  if (!expected) return false
  const actual = bindingFromEvent(event)
  if (!actual) return false
  // Treat Ctrl/Meta interchangeably for cross-platform bindings stored as Ctrl+…
  const soft = (value: string) => value.replace(/^Meta\+/, 'Ctrl+').replace(/\+Meta\+/g, '+Ctrl+')
  return soft(actual) === soft(expected) || actual === expected
}

export function loadDesktopNotifications(): boolean {
  return localStorage.getItem(NOTIFY_KEY) !== '0'
}

export function saveDesktopNotifications(enabled: boolean) {
  localStorage.setItem(NOTIFY_KEY, enabled ? '1' : '0')
}

export function clampSidebarWidth(width: number) {
  return Math.min(360, Math.max(200, Math.round(width)))
}

export function clampReviewWidth(width: number) {
  return Math.min(640, Math.max(320, Math.round(width)))
}

export function loadLayoutWidths(): LayoutWidths {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw) as Partial<LayoutWidths>
    return {
      sidebar: typeof parsed.sidebar === 'number' ? clampSidebarWidth(parsed.sidebar) : DEFAULT_LAYOUT.sidebar,
      review: typeof parsed.review === 'number' ? clampReviewWidth(parsed.review) : DEFAULT_LAYOUT.review,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function saveLayoutWidths(widths: LayoutWidths) {
  const next = {
    sidebar: clampSidebarWidth(widths.sidebar),
    review: clampReviewWidth(widths.review),
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
  return next
}

/** CSS grid-template-columns for the three-pane shell (includes 6px resize gutters). */
export function layoutGridTemplate(widths: LayoutWidths, reviewOpen: boolean) {
  const sidebar = `${clampSidebarWidth(widths.sidebar)}px`
  if (!reviewOpen) return `${sidebar} 6px minmax(420px, 1fr)`
  return `${sidebar} 6px minmax(420px, 1fr) 6px ${clampReviewWidth(widths.review)}px`
}

export function loadWorkspaceProfile(): WorkspaceProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    const parsed = JSON.parse(raw) as Partial<WorkspaceProfile>
    const usage = typeof parsed.usagePercent === 'number'
      ? Math.min(100, Math.max(0, Math.round(parsed.usagePercent)))
      : DEFAULT_PROFILE.usagePercent
    return {
      displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim()
        ? parsed.displayName.trim().slice(0, 40)
        : DEFAULT_PROFILE.displayName,
      plan: typeof parsed.plan === 'string' && parsed.plan.trim()
        ? parsed.plan.trim().slice(0, 24)
        : DEFAULT_PROFILE.plan,
      usagePercent: usage,
    }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export function saveWorkspaceProfile(profile: WorkspaceProfile) {
  const next = loadWorkspaceProfile()
  const merged: WorkspaceProfile = {
    displayName: profile.displayName?.trim().slice(0, 40) || next.displayName,
    plan: profile.plan?.trim().slice(0, 24) || next.plan,
    usagePercent: Math.min(100, Math.max(0, Math.round(profile.usagePercent ?? next.usagePercent))),
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(merged))
  return merged
}

export function profileInitials(name: string) {
  const cleaned = name.trim()
  if (!cleaned) return 'G'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

/** Map billing period enum names (e.g. USAGE_PERIOD_TYPE_WEEKLY) to a short Chinese label. */
export function periodLabelFromType(periodType?: string | null) {
  const raw = (periodType ?? '').toUpperCase()
  if (raw.includes('WEEKLY')) return '本周额度'
  if (raw.includes('MONTHLY')) return '本月额度'
  return '额度'
}

export function formatUsageLabel(percent: number, periodLabel = '本月额度') {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return `${value}% ${periodLabel}`
}

/** Parse RFC3339 / ISO period-end timestamps from billing into epoch ms. */
export function parsePeriodEndMs(periodEnd?: string | null): number | null {
  if (!periodEnd || !periodEnd.trim()) return null
  const ms = Date.parse(periodEnd.trim())
  return Number.isFinite(ms) ? ms : null
}

/**
 * Compact countdown until the billing period resets (quota rollover), e.g. "4d 17h".
 * Matches common Grok UI style rather than the local poll interval.
 */
export function formatPeriodRemainingLabel(periodEnd?: string | null, now = Date.now()): string {
  const end = parsePeriodEndMs(periodEnd)
  if (end == null) return ''
  const remaining = end - now
  if (remaining <= 0) return '即将重置'
  const totalMins = Math.floor(remaining / 60_000)
  const days = Math.floor(totalMins / (60 * 24))
  const hours = Math.floor((totalMins % (60 * 24)) / 60)
  const mins = totalMins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${Math.max(1, mins)}m`
  return '即将重置'
}

/** Local absolute time for tooltips, e.g. when the weekly quota resets. */
export function formatPeriodEndAbsolute(periodEnd?: string | null): string {
  const end = parsePeriodEndMs(periodEnd)
  if (end == null) return ''
  try {
    return new Date(end).toLocaleString()
  } catch {
    return periodEnd?.trim() ?? ''
  }
}

/** Human-readable “when was billing data last fetched” for the sidebar meter. */
export function formatBillingRefreshLabel(refreshedAt: number, now = Date.now()) {
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return ''
  const delta = Math.max(0, now - refreshedAt)
  if (delta < 45_000) return '刚刚更新'
  if (delta < 60 * 60_000) {
    const mins = Math.max(1, Math.round(delta / 60_000))
    return `${mins} 分钟前更新`
  }
  if (delta < 24 * 60 * 60_000) {
    const d = new Date(refreshedAt)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm} 更新`
  }
  const d = new Date(refreshedAt)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hh}:${mm} 更新`
}

/**
 * Hint for the next automatic *data poll* (not quota reset).
 * Wording uses 更新 to avoid confusion with period/quota 重置.
 */
export function formatBillingNextRefreshLabel(
  refreshedAt: number,
  intervalMs: number,
  now = Date.now(),
) {
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0 || intervalMs <= 0) return ''
  const remaining = refreshedAt + intervalMs - now
  if (remaining <= 15_000) return '即将自动更新'
  if (remaining < 60_000) {
    const secs = Math.max(1, Math.ceil(remaining / 1000))
    return `约 ${secs} 秒后更新`
  }
  const mins = Math.max(1, Math.ceil(remaining / 60_000))
  return `约 ${mins} 分钟后更新`
}

export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

export async function showDesktopNotification(
  title: string,
  body: string,
  enabled = loadDesktopNotifications(),
): Promise<boolean> {
  if (!enabled) return false
  if (typeof Notification === 'undefined') return false
  const allowed = await ensureNotifyPermission()
  if (!allowed) return false
  try {
    const notification = new Notification(title, {
      body,
      silent: false,
      tag: `grok-forge-${title}`,
    })
    window.setTimeout(() => notification.close(), 8_000)
    return true
  } catch {
    return false
  }
}

export type ExportHistoryKind =
  | 'patch'
  | 'patch-all'
  | 'patch-copy'
  | 'patch-copy-all'
  | 'tasks-json'
  | 'tasks-md'
  | 'replay'
  | 'replay-batch'
  | 'search-hits'
  | 'search-hits-copy'
  | 'stats'

/** Cap cached export bodies so localStorage stays within a safe budget (~8 entries). */
export const MAX_EXPORT_CONTENT_CHARS = 32_000

export type ExportHistoryEntry = {
  id: string
  kind: ExportHistoryKind
  label: string
  filename: string
  at: number
  /** Cached payload for one-click re-download; omitted when too large or unavailable. */
  content?: string
  mime?: string
}

export function clampExportContent(content: string | undefined | null): string | undefined {
  if (content == null) return undefined
  if (content.length === 0) return undefined
  if (content.length > MAX_EXPORT_CONTENT_CHARS) return undefined
  return content
}

export function exportHistoryMime(kind: ExportHistoryKind, explicit?: string) {
  if (explicit && explicit.trim()) return explicit.trim()
  if (kind === 'tasks-json') return 'application/json;charset=utf-8'
  if (kind === 'patch' || kind === 'patch-all' || kind === 'patch-copy' || kind === 'patch-copy-all') {
    return 'text/x-patch;charset=utf-8'
  }
  return 'text/markdown;charset=utf-8'
}

export function exportHistoryCanRedownload(entry: ExportHistoryEntry) {
  return typeof entry.content === 'string' && entry.content.length > 0
}

export function loadExportHistory(): ExportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): ExportHistoryEntry[] => {
      if (item === null || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const kind = row.kind
      if (
        kind !== 'patch'
        && kind !== 'patch-all'
        && kind !== 'patch-copy'
        && kind !== 'patch-copy-all'
        && kind !== 'tasks-json'
        && kind !== 'tasks-md'
        && kind !== 'replay'
        && kind !== 'replay-batch'
        && kind !== 'search-hits'
        && kind !== 'search-hits-copy'
        && kind !== 'stats'
      ) return []
      const label = typeof row.label === 'string' ? row.label.trim() : ''
      const filename = typeof row.filename === 'string' ? row.filename.trim() : ''
      const at = typeof row.at === 'number' ? row.at : 0
      const id = typeof row.id === 'string' && row.id.trim() ? row.id : `export-${at}`
      if (!label || !filename || !at) return []
      const content = clampExportContent(typeof row.content === 'string' ? row.content : undefined)
      const mime = typeof row.mime === 'string' && row.mime.trim()
        ? row.mime.trim().slice(0, 120)
        : undefined
      const entry: ExportHistoryEntry = { id, kind, label, filename, at }
      if (content) entry.content = content
      if (mime) entry.mime = mime
      return [entry]
    }).slice(0, MAX_EXPORT_HISTORY)
  } catch {
    return []
  }
}

export function saveExportHistory(entries: ExportHistoryEntry[]) {
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_EXPORT_HISTORY)))
}

export function pushExportHistory(input: {
  kind: ExportHistoryKind
  label: string
  filename: string
  at?: number
  content?: string
  mime?: string
}): ExportHistoryEntry[] {
  const at = input.at ?? Date.now()
  const content = clampExportContent(input.content)
  const entry: ExportHistoryEntry = {
    id: `export-${at}-${Math.random().toString(36).slice(2, 7)}`,
    kind: input.kind,
    label: input.label.trim().slice(0, 80) || input.filename,
    filename: input.filename.trim().slice(0, 120) || 'export',
    at,
  }
  if (content) {
    entry.content = content
    entry.mime = exportHistoryMime(input.kind, input.mime)
  }
  const next = [entry, ...loadExportHistory().filter((item) => item.id !== entry.id)].slice(0, MAX_EXPORT_HISTORY)
  saveExportHistory(next)
  return next
}

export function clearExportHistory() {
  localStorage.removeItem(EXPORT_HISTORY_KEY)
  return [] as ExportHistoryEntry[]
}

export function exportHistoryKindLabel(kind: ExportHistoryKind) {
  if (kind === 'patch') return 'Patch 文件'
  if (kind === 'patch-all') return '全部 Patch'
  if (kind === 'patch-copy') return '复制 Patch'
  if (kind === 'patch-copy-all') return '复制全部 Patch'
  if (kind === 'tasks-json') return '任务 JSON'
  if (kind === 'tasks-md') return '任务 Markdown'
  if (kind === 'search-hits') return '搜索清单'
  if (kind === 'search-hits-copy') return '复制搜索清单'
  if (kind === 'stats') return '任务统计'
  if (kind === 'replay-batch') return '批量回放'
  return '会话回放'
}

export function formatExportHistoryTime(at: number) {
  try {
    return new Date(at).toLocaleString()
  } catch {
    return String(at)
  }
}
