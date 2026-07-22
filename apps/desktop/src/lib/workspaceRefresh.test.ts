import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceRefreshController } from './workspaceRefresh'

describe('createWorkspaceRefreshController', () => {
  it('coalesces bursts into one in-flight load and one follow-up', async () => {
    let resolveLoad: (() => void) | undefined
    const load = vi.fn(() => new Promise<void>((resolve) => {
      resolveLoad = resolve
    }))
    const timers: Array<{ id: number; cb: () => void; ms: number }> = []
    let nextId = 1
    let now = 1_000
    const controller = createWorkspaceRefreshController({
      load,
      minIntervalMs: 500,
      now: () => now,
      schedule: (cb, ms) => {
        const id = nextId++
        timers.push({ id, cb, ms })
        return id
      },
      cancel: (id) => {
        const index = timers.findIndex((item) => item.id === id)
        if (index >= 0) timers.splice(index, 1)
      },
    })

    controller.request()
    controller.request()
    controller.request()
    expect(load).toHaveBeenCalledTimes(1)

    resolveLoad?.()
    await Promise.resolve()
    // dirty follow-up after in-flight completes
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('throttles when called inside the min interval', async () => {
    const load = vi.fn(async () => undefined)
    const timers: Array<{ id: number; cb: () => void; ms: number }> = []
    let nextId = 1
    let now = 10_000
    const controller = createWorkspaceRefreshController({
      load,
      minIntervalMs: 1_000,
      now: () => now,
      schedule: (cb, ms) => {
        const id = nextId++
        timers.push({ id, cb, ms })
        return id
      },
      cancel: (id) => {
        const index = timers.findIndex((item) => item.id === id)
        if (index >= 0) timers.splice(index, 1)
      },
    })

    controller.request()
    expect(load).toHaveBeenCalledTimes(1)
    await Promise.resolve()

    now = 10_200
    controller.request()
    expect(load).toHaveBeenCalledTimes(1)
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(800)

    now = 11_000
    timers[0].cb()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('requestNow bypasses the min interval', async () => {
    const load = vi.fn(async () => undefined)
    let now = 5_000
    const controller = createWorkspaceRefreshController({
      load,
      minIntervalMs: 5_000,
      now: () => now,
      schedule: (cb) => {
        cb()
        return 1
      },
      cancel: () => undefined,
    })

    controller.request()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)

    now = 5_100
    controller.requestNow()
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stop cancels pending poll and throttle timers', () => {
    const cancel = vi.fn()
    let nextId = 1
    const controller = createWorkspaceRefreshController({
      load: async () => undefined,
      minIntervalMs: 1_000,
      now: () => 0,
      schedule: () => nextId++,
      cancel,
    })
    controller.startPolling(2_000)
    controller.stop()
    expect(cancel).toHaveBeenCalled()
  })
})
