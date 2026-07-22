import { describe, expect, it, vi } from 'vitest'
import { createStreamBatcher } from './streamBatch'

describe('createStreamBatcher', () => {
  it('coalesces message and thought tokens into a single flush', () => {
    const flushes: Array<{ taskId: string; message: string; thought: string }> = []
    let scheduled: (() => void) | undefined
    const batcher = createStreamBatcher({
      flush: (batch) => flushes.push(batch),
      schedule: (cb) => {
        scheduled = cb
        return 1
      },
      cancel: () => {
        scheduled = undefined
      },
    })

    batcher.pushMessage('t1', 'Hello')
    batcher.pushMessage('t1', ' world')
    batcher.pushThought('t1', 'think')
    batcher.pushThought('t1', 'ing')
    expect(flushes).toEqual([])
    expect(batcher.isScheduled()).toBe(true)
    expect(batcher.peek()).toEqual({
      taskId: 't1',
      message: 'Hello world',
      thought: 'thinking',
    })

    scheduled!()
    expect(flushes).toEqual([
      { taskId: 't1', message: 'Hello world', thought: 'thinking' },
    ])
    expect(batcher.isScheduled()).toBe(false)
    expect(batcher.peek()).toEqual({ taskId: 't1', message: '', thought: '' })
  })

  it('flushNow applies pending text and cancels the scheduled frame', () => {
    const flush = vi.fn()
    let scheduled: (() => void) | undefined
    const cancel = vi.fn(() => {
      scheduled = undefined
    })
    const batcher = createStreamBatcher({
      flush,
      schedule: (cb) => {
        scheduled = cb
        return 7
      },
      cancel,
    })

    batcher.pushMessage('task-a', 'partial')
    batcher.flushNow()
    expect(cancel).toHaveBeenCalledWith(7)
    expect(flush).toHaveBeenCalledWith({
      taskId: 'task-a',
      message: 'partial',
      thought: '',
    })
    expect(batcher.isScheduled()).toBe(false)

    // A late scheduled callback must not double-flush (buffer already empty).
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('reset drops the buffer without flushing', () => {
    const flush = vi.fn()
    const batcher = createStreamBatcher({
      flush,
      schedule: () => 1,
      cancel: () => undefined,
    })
    batcher.pushMessage('t', 'x')
    batcher.reset()
    expect(flush).not.toHaveBeenCalled()
    expect(batcher.peek()).toEqual({ taskId: '', message: '', thought: '' })
    batcher.flushNow()
    expect(flush).not.toHaveBeenCalled()
  })

  it('ignores empty tokens', () => {
    const flush = vi.fn()
    const batcher = createStreamBatcher({
      flush,
      schedule: (cb) => {
        cb()
        return 1
      },
      cancel: () => undefined,
    })
    batcher.pushMessage('t', '')
    batcher.pushThought('t', '')
    expect(flush).not.toHaveBeenCalled()
  })
})
