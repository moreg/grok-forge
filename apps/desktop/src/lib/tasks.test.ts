import { beforeEach, describe, expect, it } from 'vitest'
import {
  archiveAssistantReply,
  attachmentLabel,
  buildAttachmentPrompt,
  createTask,
  dataAttachmentName,
  exportAllTasksFilename,
  exportAllTasksJson,
  exportAllTasksMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  filesToAttachments,
  collectTaskTags,
  filterCommandPaletteTasks,
  filterSlashCommands,
  importTasksSnapshot,
  countArchivedTasks,
  filterSessionTasks,
  exportSearchHitsFilename,
  exportSearchHitsMarkdown,
  exportSessionReplaysFilename,
  exportSessionReplaysMarkdown,
  exportTaskStatsFilename,
  exportTaskStatsMarkdown,
  filterTasksByStatsRange,
  formatTaskStatsSummary,
  globalSearchHitKindLabel,
  listTasks,
  statsTimeRangeLabel,
  statsTimeRangeStart,
  summarizeTaskStats,
  parseTaskExportPayload,
  filterTasks,
  normalizeTags,
  searchTasksGlobal,
  sortTasks,
  toggleTaskArchived,
  toggleTaskPinned,
  toggleTaskTag,
  isDataImageAttachment,
  isDataTextAttachment,
  formatStepDuration,
  helpMessage,
  applyAppearance,
  fontScaleLabel,
  loadApprovalMode,
  loadAutoReconnect,
  loadFontScale,
  loadPreferredModel,
  loadTaskSnapshot,
  loadTheme,
  loadWorkspaces,
  modelLabel,
  saveAutoReconnect,
  saveFontScale,
  savePreferredModel,
  saveTheme,
  mergeToolIntoPlan,
  normalizeMessages,
  parsePlanEntries,
  pickAllowOption,
  pickRejectOption,
  reconnectDelayMs,
  reconnectToastMessage,
  rememberWorkspace,
  saveApprovalMode,
  saveTaskSnapshot,
  statusLabel,
  titleFromPrompt,
  toResourceBlocks,
} from './tasks'

beforeEach(() => {
  localStorage.clear()
})

describe('task helpers', () => {
  it('creates a blank task with defaults', () => {
    const task = createTask()
    expect(task.title).toBe('准备开始')
    expect(task.messages).toEqual([])
    expect(task.status).toBe('idle')
    expect(task.sessionKey).toBe(task.id)
  })

  it('normalizes legacy string messages and role objects', () => {
    expect(normalizeMessages([
      '修复超时',
      { role: 'assistant', content: '已修复' },
      { role: 'user', content: '' },
      { role: 'user', content: '', attachments: ['data:image/png;base64,abc'] },
    ])).toEqual([
      { role: 'user', content: '修复超时' },
      { role: 'assistant', content: '已修复' },
      { role: 'user', content: '', attachments: ['data:image/png;base64,abc'] },
    ])
  })

  it('persists and reloads the task snapshot', () => {
    const task = createTask({ title: '修复超时', messages: [{ role: 'user', content: '请修复' }] })
    saveTaskSnapshot({ tasks: [task], activeTaskId: task.id })
    const loaded = loadTaskSnapshot()
    expect(loaded.tasks).toHaveLength(1)
    expect(loaded.tasks[0].title).toBe('修复超时')
    expect(loaded.tasks[0].messages[0]).toEqual({ role: 'user', content: '请修复' })
    expect(loaded.activeTaskId).toBe(task.id)
  })

  it('falls back to a blank task when storage is empty or corrupt', () => {
    expect(loadTaskSnapshot().tasks).toHaveLength(1)
    localStorage.setItem('grok-forge-tasks', '{bad json')
    expect(loadTaskSnapshot().tasks[0].title).toBe('准备开始')
  })

  it('filters tasks by title, message content, and tags', () => {
    const tasks = [
      createTask({ title: '登录超时', messages: [{ role: 'user', content: '修复接口' }], tags: ['bug'] }),
      createTask({ title: '重构设置', messages: [{ role: 'user', content: '拆分模块' }], tags: ['refactor'] }),
    ]
    expect(filterTasks(tasks, '超时')).toHaveLength(1)
    expect(filterTasks(tasks, '拆分')).toHaveLength(1)
    expect(filterTasks(tasks, '')).toHaveLength(2)
    expect(filterTasks(tasks, '', 'bug')).toHaveLength(1)
    expect(filterTasks(tasks, 'bug')).toHaveLength(1)
    expect(collectTaskTags(tasks)).toEqual(['bug', 'refactor'])
    expect(normalizeTags([' Bug ', 'bug', '  '])).toEqual(['Bug'])
    expect(toggleTaskTag(['bug'], 'bug')).toEqual([])
    expect(toggleTaskTag([], 'feat')).toEqual(['feat'])
    expect(searchTasksGlobal(tasks, '修复')[0].kind).toBe('message')
    expect(searchTasksGlobal(tasks, '重构')[0].kind).toBe('title')
    expect(searchTasksGlobal(tasks, '')).toEqual([])
    expect(searchTasksGlobal(tasks, '修复')[0].messageIndex).toBe(0)
  })

  it('filters session panel tasks by title and session ids', () => {
    const tasks = [
      createTask({ id: 't1', title: '登录修复', acpSessionId: 'sess-abc', sessionKey: 'key-1' }),
      createTask({ id: 't2', title: '样式调整', acpSessionId: 'sess-xyz', tags: ['ui'] }),
    ]
    expect(filterSessionTasks(tasks, '')).toHaveLength(2)
    expect(filterSessionTasks(tasks, '登录').map((task) => task.id)).toEqual(['t1'])
    expect(filterSessionTasks(tasks, 'sess-xyz').map((task) => task.id)).toEqual(['t2'])
    expect(filterSessionTasks(tasks, 'ui').map((task) => task.id)).toEqual(['t2'])
    expect(filterSessionTasks(tasks, 'nope')).toEqual([])
  })

  it('summarizes task stats for the dashboard card', () => {
    const tasks = [
      createTask({ id: '1', title: 'A', status: 'running', messages: [{ role: 'user', content: 'hi' }], tags: ['bug'], pinned: true }),
      createTask({ id: '2', title: 'B', status: 'done', messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }], tags: ['bug', 'ui'], archived: true }),
      createTask({ id: '3', title: 'C', status: 'idle', tags: ['ui'] }),
    ]
    const stats = summarizeTaskStats(tasks)
    expect(stats).toMatchObject({
      total: 3,
      active: 2,
      archived: 1,
      pinned: 1,
      running: 1,
      done: 1,
      idle: 1,
      messages: 3,
      tags: 2,
    })
    expect(stats.topTags[0].tag).toMatch(/bug|ui/)
    expect(formatTaskStatsSummary(stats)).toContain('共 3 个任务')
  })

  it('filters task stats by time range', () => {
    const now = new Date('2026-07-18T15:00:00').getTime()
    const todayStart = statsTimeRangeStart('today', now)!
    const tasks = [
      createTask({ id: 'fresh', title: '今日', updatedAt: now - 60_000 }),
      createTask({ id: 'week', title: '本周', updatedAt: now - 3 * 24 * 60 * 60 * 1000 }),
      createTask({ id: 'month', title: '本月', updatedAt: now - 20 * 24 * 60 * 60 * 1000 }),
      createTask({ id: 'old', title: '更早', updatedAt: now - 40 * 24 * 60 * 60 * 1000 }),
    ]
    expect(statsTimeRangeStart('all', now)).toBeNull()
    expect(todayStart).toBeLessThanOrEqual(now)
    expect(filterTasksByStatsRange(tasks, 'all', now)).toHaveLength(4)
    expect(filterTasksByStatsRange(tasks, 'today', now).map((task) => task.id)).toEqual(['fresh'])
    expect(filterTasksByStatsRange(tasks, '7d', now).map((task) => task.id)).toEqual(['fresh', 'week'])
    expect(filterTasksByStatsRange(tasks, '30d', now).map((task) => task.id)).toEqual(['fresh', 'week', 'month'])
    expect(summarizeTaskStats(filterTasksByStatsRange(tasks, 'today', now)).total).toBe(1)
  })

  it('exports task stats and search hits as markdown checklists', () => {
    const now = new Date('2026-07-18T12:00:00Z').getTime()
    const tasks = [
      createTask({
        id: 't1',
        title: '登录超时',
        messages: [{ role: 'user', content: '修复接口超时' }],
        tags: ['bug'],
      }),
      createTask({ id: 't2', title: '重构设置', tags: ['ui'] }),
    ]
    const stats = summarizeTaskStats(tasks)
    const statsMd = exportTaskStatsMarkdown(stats, '7d', now)
    expect(statsMd).toContain('# 任务统计')
    expect(statsMd).toContain('7 天')
    expect(statsMd).toContain('| 总数 | 2 |')
    expect(statsMd).toContain('#bug')
    expect(statsTimeRangeLabel('today')).toBe('今日')
    expect(exportTaskStatsFilename('all', now)).toMatch(/^grok-stats-all-.*\.md$/)

    const hits = searchTasksGlobal(tasks, '超时')
    expect(hits.length).toBeGreaterThan(0)
    expect(globalSearchHitKindLabel(hits[0])).toBeTruthy()
    const searchMd = exportSearchHitsMarkdown('超时', hits, now)
    expect(searchMd).toContain('# 搜索结果：超时')
    expect(searchMd).toContain('[ ]')
    expect(searchMd).toContain('登录超时')
    expect(exportSearchHitsMarkdown('', [], now)).toContain('无匹配结果')
    expect(exportSearchHitsFilename('登录 超时', now)).toMatch(/^grok-search-登录-超时-.*\.md$/)

    const batch = exportSessionReplaysMarkdown(tasks, now)
    expect(batch).toContain('# 会话回放批量导出')
    expect(batch).toContain('任务数：2')
    expect(batch).toContain('登录超时')
    expect(batch).toContain('重构设置')
    expect(exportSessionReplaysMarkdown([], now)).toContain('暂无会话')
    expect(exportSessionReplaysFilename(2, now)).toMatch(/^grok-replays-2-.*\.md$/)
  })

  it('archives tasks out of the default list and keeps pin cleared', () => {
    const active = createTask({ id: 'a', title: '进行中', updatedAt: 20, pinned: true })
    const archived = toggleTaskArchived(createTask({ id: 'b', title: '旧任务', updatedAt: 30, pinned: true }))
    expect(archived.archived).toBe(true)
    expect(archived.pinned).toBe(false)
    expect(countArchivedTasks([active, archived])).toBe(1)
    expect(listTasks([active, archived]).map((task) => task.id)).toEqual(['a'])
    expect(listTasks([active, archived], '', null, { includeArchived: true }).map((task) => task.id)).toEqual(['a', 'b'])
    expect(toggleTaskArchived(archived).archived).toBe(false)

    const json = exportAllTasksJson([archived])
    const parsed = parseTaskExportPayload(json)
    expect(parsed.tasks[0].archived).toBe(true)
  })

  it('pins tasks to the top and preserves pin in export/import', () => {
    const older = createTask({ id: 'a', title: '旧任务', updatedAt: 10 })
    const newer = createTask({ id: 'b', title: '新任务', updatedAt: 20 })
    const pinned = toggleTaskPinned(createTask({ id: 'c', title: '置顶任务', updatedAt: 5 }))
    expect(pinned.pinned).toBe(true)
    expect(sortTasks([older, newer, pinned]).map((task) => task.id)).toEqual(['c', 'b', 'a'])
    expect(listTasks([older, newer, pinned], '任务').map((task) => task.id)).toEqual(['c', 'b', 'a'])
    expect(toggleTaskPinned(pinned).pinned).toBe(false)

    const json = exportAllTasksJson([pinned, newer])
    const parsed = parseTaskExportPayload(json)
    expect(parsed.tasks.find((task) => task.id === 'c')?.pinned).toBe(true)
    const merged = importTasksSnapshot([older], 'a', parsed, 'merge')
    expect(merged.tasks.find((task) => task.id === 'c')?.pinned).toBe(true)
  })

  it('parses plan entries and truncates titles', () => {
    expect(titleFromPrompt('  修复登录超时问题并补测试  ')).toBe('修复登录超时问题并补测试')
    expect(titleFromPrompt('a'.repeat(40)).endsWith('…')).toBe(true)
    expect(parsePlanEntries([
      { content: '分析链路', status: 'completed' },
      { text: '跑测试', status: 'in_progress', detail: 'npm test' },
      '裸字符串步骤',
      { content: '' },
    ])).toEqual([
      { content: '分析链路', status: 'completed' },
      { content: '跑测试', status: 'in_progress', detail: 'npm test' },
      { content: '裸字符串步骤', status: 'pending' },
    ])
  })

  it('stores approval mode, workspaces, and status labels', () => {
    expect(loadApprovalMode()).toBe('approve')
    saveApprovalMode('observe')
    expect(loadApprovalMode()).toBe('observe')
    // Unset → default ON (open-to-connect).
    expect(loadAutoReconnect()).toBe(true)
    saveAutoReconnect(false)
    expect(loadAutoReconnect()).toBe(false)
    saveAutoReconnect(true)
    expect(loadAutoReconnect()).toBe(true)
    expect(statusLabel('running')).toBe('执行中')
    expect(statusLabel('done')).toBe('已完成')
    expect(statusLabel('idle')).toBe('就绪')
    expect(loadWorkspaces()).toEqual([])
    expect(rememberWorkspace('D:\\a')).toEqual(['D:\\a'])
    expect(rememberWorkspace('D:\\b', ['D:\\a'])).toEqual(['D:\\b', 'D:\\a'])
  })

  it('archives assistant replies and builds help text', () => {
    const task = createTask({
      messages: [{ role: 'user', content: '请修复' }],
      liveMessage: '  已修好  ',
      liveThought: '  先检查测试  ',
      liveEvents: [{ kind: 'tool', title: 'read', status: 'completed' }],
      status: 'running',
    })
    const archived = archiveAssistantReply(task)
    expect(archived.messages).toEqual([
      { role: 'user', content: '请修复' },
      { role: 'assistant', content: '已修好' },
    ])
    expect(archived.liveMessage).toBe('')
    expect(archived.liveThought).toBe('')
    expect(archived.liveEvents).toEqual([])
    expect(archived.status).toBe('done')
    expect(helpMessage().content).toContain('/stop')
    expect(archiveAssistantReply(createTask({ liveMessage: '   ' })).messages).toEqual([])
    expect(createTask().liveThought).toBe('')
  })

  it('merges tool events into the execution timeline', () => {
    const first = mergeToolIntoPlan([], {
      kind: 'tool',
      toolCallId: 'call-1',
      title: '读取文件',
      status: 'in_progress',
      detail: 'src/a.ts',
      toolKind: 'read',
    })
    expect(first[0]).toMatchObject({ content: '读取文件', status: 'in_progress', toolCallId: 'call-1' })
    const second = mergeToolIntoPlan(first, {
      kind: 'tool',
      toolCallId: 'call-1',
      title: '读取文件',
      status: 'completed',
      detail: 'src/a.ts',
    })
    expect(second).toHaveLength(1)
    expect(second[0].status).toBe('completed')
    expect(formatStepDuration({ content: 'x', status: 'completed', startedAt: Date.now() - 2500, finishedAt: Date.now() })).toBe('3s')
    expect(formatStepDuration({ content: 'y', status: 'completed' })).toBeUndefined()
    expect(formatStepDuration({
      content: 'z',
      status: 'completed',
      startedAt: Date.now() - 125_000,
      finishedAt: Date.now(),
    })).toMatch(/m /)

    const failed = mergeToolIntoPlan([], {
      kind: 'tool',
      title: '失败工具',
      status: 'failed',
      paths: ['a.ts', 'b.ts'],
    })
    expect(failed[0].status).toBe('failed')
    expect(parsePlanEntries([{ content: '坏步骤', status: 'failed' }])[0].status).toBe('failed')
  })

  it('builds attachment prompts and resource blocks', () => {
    expect(buildAttachmentPrompt('修复', ['E:\\a.ts'])).toContain('a.ts')
    expect(toResourceBlocks(['E:\\a.ts'])[0].resource.uri).toContain('file://')
    expect(pickAllowOption([{ optionId: 'allow-once', kind: 'allow_once' }])?.optionId).toBe('allow-once')
    expect(pickRejectOption([{ optionId: 'reject-once', kind: 'reject_once' }])?.optionId).toBe('reject-once')

    const image = 'data:image/png;base64,abc'
    expect(isDataImageAttachment(image)).toBe(true)
    expect(attachmentLabel(image)).toContain('粘贴图片')
    expect(buildAttachmentPrompt('看图', [image])).toContain('粘贴图片')
    expect(toResourceBlocks([image])[0].resource).toMatchObject({
      uri: image,
      mimeType: 'image/png',
      text: 'abc',
    })
    expect(attachmentLabel('file:///C:/repo/docs/readme.md')).toBe('readme.md')
    expect(isDataImageAttachment('C:\\a.ts')).toBe(false)
    expect(buildAttachmentPrompt('x', [])).toBe('x')

    const named = 'data:text/plain;name=notes.md;base64,SGVsbG8='
    expect(isDataTextAttachment(named)).toBe(true)
    expect(dataAttachmentName(named)).toBe('notes.md')
    expect(attachmentLabel(named)).toBe('notes.md')
    expect(toResourceBlocks([named])[0].resource.mimeType).toBe('text/plain')
  })

  it('converts dropped files into attachment refs', async () => {
    const withPath = new File(['x'], 'native.ts', { type: 'text/typescript' })
    Object.defineProperty(withPath, 'path', { value: 'E:\\repo\\native.ts' })
    const text = new File(['hello world'], 'hello.txt', { type: 'text/plain' })
    const image = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    const originalReader = globalThis.FileReader
    class MockReader {
      result: string | null = null
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      readAsDataURL() {
        this.result = 'data:image/png;base64,qq'
        queueMicrotask(() => this.onload?.())
      }
    }
    // @ts-expect-error test mock
    globalThis.FileReader = MockReader
    const attachments = await filesToAttachments([withPath, text, image])
    globalThis.FileReader = originalReader
    expect(attachments[0]).toBe('E:\\repo\\native.ts')
    expect(attachments[1]).toContain('data:text/plain;name=hello.txt')
    expect(attachments[2]).toBe('data:image/png;base64,qq')
  })

  it('formats reconnect toast progress and delay', () => {
    expect(reconnectToastMessage(1)).toContain('1/5')
    expect(reconnectToastMessage(3, 5)).toContain('3/5')
    expect(reconnectToastMessage(9)).toContain('上限')
    expect(reconnectDelayMs(1)).toBe(1_000)
    expect(reconnectDelayMs(2)).toBe(2_000)
    expect(reconnectDelayMs(4)).toBe(8_000)
    expect(reconnectDelayMs(10)).toBe(8_000)
  })

  it('persists appearance and preferred model preferences', () => {
    expect(loadTheme()).toBe('dark')
    expect(loadFontScale()).toBe('md')
    expect(loadPreferredModel()).toBe('grok-build')
    saveTheme('light')
    saveFontScale('lg')
    savePreferredModel('grok-4.5')
    expect(loadTheme()).toBe('light')
    expect(loadFontScale()).toBe('lg')
    expect(loadPreferredModel()).toBe('grok-4.5')
    expect(modelLabel('grok-4.5')).toContain('4.5')
    expect(fontScaleLabel('sm')).toBe('小')
    applyAppearance('light', 'lg')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.font).toBe('lg')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('exports task replay as markdown', () => {
    const task = createTask({
      title: '修复 登录/超时',
      status: 'done',
      acpSessionId: 'sess-1',
      updatedAt: Date.parse('2026-07-17T00:00:00.000Z'),
      messages: [
        { role: 'user', content: '请修复超时' },
        { role: 'assistant', content: '已修好' },
      ],
      planSteps: [
        { content: '分析链路', status: 'completed', detail: 'auth.ts' },
        { content: '写测试', status: 'pending' },
      ],
      liveMessage: '补充说明',
      liveThought: '先看日志',
    })
    const markdown = exportTaskReplay(task)
    expect(markdown).toContain('# 修复 登录/超时')
    expect(markdown).toContain('sess-1')
    expect(markdown).toContain('## 执行计划')
    expect(markdown).toContain('[x] 分析链路')
    expect(markdown).toContain('### 你')
    expect(markdown).toContain('请修复超时')
    expect(markdown).toContain('## 进行中思考')
    expect(markdown).toContain('先看日志')
    expect(markdown).toContain('## 进行中回复')
    expect(exportTaskReplayFilename(task)).toMatch(/^grok-replay-修复-登录超时-2026-07-17\.md$/)
  })

  it('exports all tasks as json and markdown bundles', () => {
    const tasks = [
      createTask({ title: 'A', messages: [{ role: 'user', content: 'one' }] }),
      createTask({ title: 'B', messages: [{ role: 'assistant', content: 'two' }] }),
    ]
    const json = exportAllTasksJson(tasks, tasks[0].id)
    expect(json).toContain('"version": 1')
    expect(json).toContain(tasks[0].id)
    expect(exportAllTasksMarkdown(tasks)).toContain('# A')
    expect(exportAllTasksMarkdown(tasks)).toContain('# B')
    expect(exportAllTasksFilename('json')).toMatch(/^grok-tasks-.*\.json$/)
    expect(exportAllTasksFilename('md')).toMatch(/^grok-tasks-.*\.md$/)
    expect(exportAllTasksMarkdown([])).toContain('暂无任务')
  })

  it('parses and imports exported task snapshots', () => {
    const source = [
      createTask({ id: 'a', title: '旧任务', updatedAt: 10, messages: [{ role: 'user', content: 'old' }] }),
      createTask({ id: 'b', title: '保留', updatedAt: 50, messages: [{ role: 'user', content: 'keep' }] }),
    ]
    const json = exportAllTasksJson([
      createTask({ id: 'a', title: '新任务', updatedAt: 20, messages: [{ role: 'user', content: 'new' }] }),
      createTask({ id: 'c', title: '新增', updatedAt: 30 }),
    ], 'c')
    const parsed = parseTaskExportPayload(json)
    expect(parsed.tasks).toHaveLength(2)
    const merged = importTasksSnapshot(source, 'b', parsed, 'merge')
    expect(merged.imported).toBe(2)
    expect(merged.tasks.find((task) => task.id === 'a')?.title).toBe('新任务')
    expect(merged.tasks.some((task) => task.id === 'b')).toBe(true)
    expect(merged.activeTaskId).toBe('c')

    const replaced = importTasksSnapshot(source, 'b', parsed, 'replace')
    expect(replaced.tasks).toHaveLength(2)
    expect(replaced.tasks.every((task) => !task.acpSessionId)).toBe(true)
    expect(replaced.activeTaskId).toBe('c')

    expect(filterSlashCommands('stop').map((item) => item.command)).toContain('/stop')
    expect(filterSlashCommands('不存在')).toHaveLength(0)
    expect(filterSlashCommands('').length).toBeGreaterThan(0)
    expect(filterCommandPaletteTasks(source, '保留')[0].id).toBe('b')
    expect(filterCommandPaletteTasks(source, '').length).toBe(2)
    expect(() => parseTaskExportPayload('{}')).toThrow(/tasks/)
    expect(() => parseTaskExportPayload([])).toThrow(/没有有效任务/)
    expect(() => parseTaskExportPayload(null)).toThrow(/无法识别/)
    const arrayParsed = parseTaskExportPayload([{ id: 'x', title: '仅数组', messages: ['hi'] }])
    expect(arrayParsed.tasks[0].title).toBe('仅数组')
    // older local wins on merge when timestamps are newer
    const olderIncoming = parseTaskExportPayload({
      tasks: [{ id: 'b', title: '更旧', updatedAt: 1, messages: [] }],
    })
    const skip = importTasksSnapshot(source, 'b', olderIncoming, 'merge')
    expect(skip.skipped).toBe(1)
    expect(skip.imported).toBe(0)

    const rich = parseTaskExportPayload({
      tasks: [{
        id: 'rich',
        title: '  ',
        status: 'weird',
        planSteps: [
          { content: '完成', status: 'completed', detail: 'ok', toolCallId: 't1' },
          { content: '失败', status: 'failed' },
          { content: '进行中', status: 'in_progress' },
          { content: '挂起', status: 'pending' },
          { content: '未知态', status: 'wat' },
          { content: '' },
          null,
        ],
        attachments: ['a.ts', 1, null],
        messages: [{ role: 'assistant', content: 'hi' }, { role: 'nope', content: 'x' }],
      }],
    })
    expect(rich.tasks[0].title).toBe('导入任务')
    expect(rich.tasks[0].status).toBe('idle')
    expect(rich.tasks[0].planSteps).toHaveLength(5)
    expect(rich.tasks[0].attachments).toEqual(['a.ts'])
    expect(() => importTasksSnapshot(source, 'b', { tasks: [] }, 'merge')).toThrow(/没有有效任务/)
  })
})
