import { describe, expect, it } from 'vitest'
import { createTask } from './tasks'
import { sidebarTaskSignature, sidebarTasksEqual } from './sidebarCompare'

describe('sidebarCompare', () => {
  it('ignores live stream fields when comparing task lists', () => {
    const base = createTask({
      id: 't1',
      title: 'Fix login',
      status: 'running',
      messages: [{ role: 'user', content: 'please fix' }],
      updatedAt: 100,
    })
    const withLive = {
      ...base,
      liveMessage: 'partial '.repeat(50),
      liveThought: 'thinking…',
      liveEvents: [{ kind: 'tool', title: 'read' }],
      planSteps: [{ content: 'step', status: 'in_progress' as const }],
    }
    expect(sidebarTaskSignature(base)).toBe(sidebarTaskSignature(withLive))
    expect(sidebarTasksEqual([base], [withLive])).toBe(true)
  })

  it('detects title / status / message changes', () => {
    const a = createTask({ id: 't1', title: 'A', status: 'idle', updatedAt: 1 })
    const b = { ...a, title: 'B' }
    const c = { ...a, status: 'running' as const }
    const d = {
      ...a,
      messages: [{ role: 'user' as const, content: 'new' }],
    }
    expect(sidebarTasksEqual([a], [b])).toBe(false)
    expect(sidebarTasksEqual([a], [c])).toBe(false)
    expect(sidebarTasksEqual([a], [d])).toBe(false)
  })
})
