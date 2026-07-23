import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAYOUT,
  DEFAULT_PROFILE,
  DEFAULT_SHORTCUTS,
  bindingFromEvent,
  clampReviewWidth,
  clampSidebarWidth,
  eventMatchesShortcut,
  formatBillingNextRefreshLabel,
  formatBillingRefreshLabel,
  formatPeriodEndAbsolute,
  formatPeriodRemainingLabel,
  formatUsageLabel,
  parsePeriodEndMs,
  periodLabelFromType,
  layoutGridTemplate,
  MAX_EXPORT_CONTENT_CHARS,
  clearExportHistory,
  clampExportContent,
  exportHistoryCanRedownload,
  exportHistoryKindLabel,
  exportHistoryMime,
  formatExportHistoryTime,
  loadDesktopNotifications,
  loadExportHistory,
  loadLayoutWidths,
  loadShortcuts,
  loadWorkspaceProfile,
  normalizeBinding,
  profileInitials,
  pushExportHistory,
  resetShortcuts,
  saveDesktopNotifications,
  saveLayoutWidths,
  saveShortcuts,
  saveWorkspaceProfile,
  notifyUserError,
  showDesktopNotification,
} from './prefs'

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('prefs helpers', () => {
  it('normalizes and matches shortcut bindings', () => {
    expect(normalizeBinding('ctrl+shift+r')).toBe('Ctrl+Shift+R')
    expect(normalizeBinding('meta+n')).toBe('Meta+N')

    const event = {
      key: 'n',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as KeyboardEvent
    expect(bindingFromEvent(event)).toBe('Ctrl+N')
    expect(eventMatchesShortcut(event, 'Ctrl+N')).toBe(true)
    expect(eventMatchesShortcut(event, 'Ctrl+Shift+N')).toBe(false)
  })

  it('tracks export history with a capped local list and content cache', () => {
    expect(loadExportHistory()).toEqual([])
    const first = pushExportHistory({
      kind: 'patch',
      label: 'a.ts',
      filename: 'a.patch',
      at: 1000,
      content: 'diff --git a/a.ts b/a.ts\n',
      mime: 'text/x-patch;charset=utf-8',
    })
    expect(first).toHaveLength(1)
    expect(first[0].label).toBe('a.ts')
    expect(exportHistoryCanRedownload(first[0])).toBe(true)
    expect(first[0].content).toContain('diff --git')
    expect(exportHistoryMime(first[0].kind, first[0].mime)).toContain('patch')

    pushExportHistory({ kind: 'tasks-json', label: '3 个任务', filename: 'tasks.json', at: 2000 })
    const loaded = loadExportHistory()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].kind).toBe('tasks-json')
    expect(exportHistoryCanRedownload(loaded[0])).toBe(false)
    expect(exportHistoryKindLabel('patch-copy')).toContain('复制')
    expect(exportHistoryKindLabel('search-hits')).toContain('搜索')
    expect(exportHistoryKindLabel('search-hits-copy')).toContain('复制')
    expect(exportHistoryKindLabel('stats')).toContain('统计')
    expect(exportHistoryKindLabel('replay-batch')).toContain('批量')
    expect(formatExportHistoryTime(2000)).toBeTruthy()
    expect(exportHistoryMime('tasks-json')).toContain('json')
    expect(exportHistoryMime('replay')).toContain('markdown')
    expect(exportHistoryMime('search-hits')).toContain('markdown')
    expect(exportHistoryMime('replay-batch')).toContain('markdown')
    expect(clampExportContent('')).toBeUndefined()
    expect(clampExportContent('ok')).toBe('ok')
    expect(clampExportContent('x'.repeat(MAX_EXPORT_CONTENT_CHARS + 1))).toBeUndefined()

    pushExportHistory({
      kind: 'tasks-md',
      label: 'huge',
      filename: 'huge.md',
      at: 3000,
      content: 'y'.repeat(MAX_EXPORT_CONTENT_CHARS + 10),
    })
    expect(exportHistoryCanRedownload(loadExportHistory()[0])).toBe(false)

    expect(clearExportHistory()).toEqual([])
    expect(loadExportHistory()).toEqual([])
  })

  it('persists shortcuts and desktop notification preference', () => {
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS)
    expect(loadDesktopNotifications()).toBe(true)

    saveShortcuts({ ...DEFAULT_SHORTCUTS, newTask: 'Ctrl+Shift+N' })
    saveDesktopNotifications(false)
    expect(loadShortcuts().newTask).toBe('Ctrl+Shift+N')
    expect(loadDesktopNotifications()).toBe(false)
    expect(resetShortcuts()).toEqual(DEFAULT_SHORTCUTS)
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS)
  })

  it('shows desktop notifications when permission is granted', async () => {
    const close = vi.fn()
    const NotificationMock = vi.fn().mockImplementation(function NotificationMock() {
      return { close }
    }) as unknown as typeof Notification & { requestPermission: ReturnType<typeof vi.fn> }
    Object.defineProperty(NotificationMock, 'permission', { value: 'granted', configurable: true })
    ;(NotificationMock as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)

    await expect(showDesktopNotification('标题', '正文', true)).resolves.toBe(true)
    expect(NotificationMock).toHaveBeenCalledWith('标题', expect.objectContaining({ body: '正文' }))
    await expect(showDesktopNotification('标题', '正文', false)).resolves.toBe(false)
  })

  it('requests notification permission when default', async () => {
    const close = vi.fn()
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const NotificationMock = vi.fn().mockImplementation(function NotificationMock() {
      return { close }
    }) as unknown as typeof Notification
    Object.defineProperty(NotificationMock, 'permission', { value: 'default', configurable: true })
    Object.defineProperty(NotificationMock, 'requestPermission', { value: requestPermission })
    vi.stubGlobal('Notification', NotificationMock)

    await expect(showDesktopNotification('A', 'B', true)).resolves.toBe(true)
    expect(requestPermission).toHaveBeenCalled()
  })

  it('returns false when notifications are denied or unavailable', async () => {
    const NotificationMock = vi.fn() as unknown as typeof Notification
    Object.defineProperty(NotificationMock, 'permission', { value: 'denied', configurable: true })
    vi.stubGlobal('Notification', NotificationMock)
    await expect(showDesktopNotification('A', 'B', true)).resolves.toBe(false)

    vi.stubGlobal('Notification', undefined)
    await expect(showDesktopNotification('A', 'B', true)).resolves.toBe(false)
  })

  it('falls back to alert when notifyUserError cannot show a notification', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.stubGlobal('Notification', undefined)
    await notifyUserError('错误', '凭证检查失败，请重试。')
    expect(alertSpy).toHaveBeenCalledWith('错误\n凭证检查失败，请重试。')
    alertSpy.mockRestore()
  })

  it('ignores pure modifier key events when recording bindings', () => {
    expect(bindingFromEvent({ key: 'Control', ctrlKey: true } as KeyboardEvent)).toBeNull()
    expect(eventMatchesShortcut({ key: 'Control', ctrlKey: true } as KeyboardEvent, 'Ctrl+N')).toBe(false)
    expect(normalizeBinding('  ')).toBe('')
  })

  it('persists layout widths and workspace profile', () => {
    expect(loadLayoutWidths()).toEqual(DEFAULT_LAYOUT)
    expect(clampSidebarWidth(100)).toBe(200)
    expect(clampReviewWidth(900)).toBe(640)
    const layout = saveLayoutWidths({ sidebar: 280, review: 500 })
    expect(loadLayoutWidths()).toEqual(layout)
    expect(layoutGridTemplate(layout, true)).toContain('280px')
    expect(layoutGridTemplate(layout, false)).toContain('6px')

    expect(loadWorkspaceProfile()).toEqual(DEFAULT_PROFILE)
    const profile = saveWorkspaceProfile({ displayName: 'Ada', plan: 'Pro', usagePercent: 72 })
    expect(loadWorkspaceProfile()).toEqual(profile)
    expect(profileInitials('Ada Lovelace')).toBe('AL')
    expect(profileInitials('')).toBe('G')
    expect(profileInitials('Solo')).toBe('SO')
    expect(formatUsageLabel(72)).toBe('72% 本月额度')
    expect(formatUsageLabel(150)).toBe('100% 本月额度')
    expect(formatUsageLabel(37, '本周额度')).toBe('37% 本周额度')
    expect(periodLabelFromType('USAGE_PERIOD_TYPE_WEEKLY')).toBe('本周额度')
    expect(periodLabelFromType('USAGE_PERIOD_TYPE_MONTHLY')).toBe('本月额度')
    expect(periodLabelFromType(undefined)).toBe('额度')
    const now = Date.UTC(2026, 6, 19, 15, 30, 0)
    expect(formatBillingRefreshLabel(now - 10_000, now)).toBe('刚刚更新')
    expect(formatBillingRefreshLabel(now - 5 * 60_000, now)).toBe('5 分钟前更新')
    expect(formatBillingNextRefreshLabel(now - 30_000, 120_000, now)).toBe('约 2 分钟后更新')
    expect(formatBillingNextRefreshLabel(now - 119_000, 120_000, now)).toBe('即将自动更新')
    expect(parsePeriodEndMs('2026-07-24T08:30:00.000Z')).toBe(Date.parse('2026-07-24T08:30:00.000Z'))
    expect(parsePeriodEndMs('not-a-date')).toBeNull()
    // 4d 17h until period end
    expect(formatPeriodRemainingLabel('2026-07-24T08:30:00.000Z', now)).toBe('4d 17h')
    expect(formatPeriodRemainingLabel('2026-07-19T18:45:00.000Z', now)).toBe('3h 15m')
    expect(formatPeriodRemainingLabel('2026-07-19T15:45:00.000Z', now)).toBe('15m')
    expect(formatPeriodRemainingLabel('2026-07-19T15:00:00.000Z', now)).toBe('即将重置')
    expect(formatPeriodEndAbsolute('2026-07-24T08:30:00.000Z')).toMatch(/2026/)

    localStorage.setItem('grok-forge-layout-widths', '{bad')
    expect(loadLayoutWidths()).toEqual(DEFAULT_LAYOUT)
    localStorage.setItem('grok-forge-profile', '{bad')
    expect(loadWorkspaceProfile()).toEqual(DEFAULT_PROFILE)
    localStorage.setItem('grok-forge-layout-widths', JSON.stringify({ sidebar: 'x' }))
    expect(loadLayoutWidths().sidebar).toBe(DEFAULT_LAYOUT.sidebar)
    localStorage.setItem('grok-forge-profile', JSON.stringify({ displayName: '  ', plan: 1, usagePercent: -3 }))
    expect(loadWorkspaceProfile()).toMatchObject({ displayName: DEFAULT_PROFILE.displayName, usagePercent: 0 })
    expect(saveWorkspaceProfile({ displayName: '', plan: '', usagePercent: 200 })).toMatchObject({
      usagePercent: 100,
    })
    localStorage.setItem('grok-forge-shortcuts', '{bad')
    expect(loadShortcuts()).toEqual(DEFAULT_SHORTCUTS)
  })
})
