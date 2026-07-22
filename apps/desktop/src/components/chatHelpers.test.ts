import { describe, expect, it } from 'vitest'
import {
  asEvents,
  isToolDoneStatus,
  isToolFailedStatus,
  isToolRunningStatus,
  mergeLiveEvent,
  thoughtPreview,
} from './chatHelpers'

describe('chatHelpers', () => {
  it('filters live events to tool/plan only', () => {
    expect(asEvents([
      { kind: 'tool', title: 'a' },
      { kind: 'message', text: 'x' },
      { kind: 'plan', entries: [] },
      { kind: 'thought', text: 't' },
      null,
    ])).toEqual([
      { kind: 'tool', title: 'a' },
      { kind: 'plan', entries: [] },
    ])
  })

  it('merges tools by id and replaces plan rows', () => {
    const first = mergeLiveEvent([], { kind: 'tool', toolCallId: '1', title: 'read', status: 'running' } as never)
    const second = mergeLiveEvent(first, { kind: 'tool', toolCallId: '1', title: 'read', status: 'done' } as never)
    expect(second).toHaveLength(1)
    expect((second[0] as { status: string }).status).toBe('done')

    const withPlan = mergeLiveEvent(second, { kind: 'plan', entries: [1] } as never)
    const replaced = mergeLiveEvent(withPlan, { kind: 'plan', entries: [1, 2] } as never)
    expect(replaced.filter((row) => (row as { kind: string }).kind === 'plan')).toHaveLength(1)
    expect((replaced.find((row) => (row as { kind: string }).kind === 'plan') as { entries: number[] }).entries).toEqual([1, 2])
  })

  it('classifies tool status helpers', () => {
    expect(isToolRunningStatus('in_progress')).toBe(true)
    expect(isToolDoneStatus('completed')).toBe(true)
    expect(isToolFailedStatus('error')).toBe(true)
    expect(thoughtPreview('hello world from grok', 8)).toBe('hello wo…')
  })
})
