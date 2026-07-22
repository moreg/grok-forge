import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

/**
 * jsdom defaults to a narrow-ish viewport; pin a desktop width so the review
 * pane stays open unless a test resizes intentionally.
 */
beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1_440 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 })
})

/**
 * jsdom does not paint, so native rAF never runs. Map it to setTimeout(0) so
 * stream-token batching still coalesces within one sync turn, but flushes when
 * tests await a macrotask (`flushStreamBatch` / `waitFor`).
 */
beforeAll(() => {
  const pending = new Map<number, ReturnType<typeof setTimeout>>()
  let seq = 1
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = seq++
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id)
        cb(typeof performance !== 'undefined' ? performance.now() : Date.now())
      }, 0),
    )
    return id
  }) as typeof requestAnimationFrame

  globalThis.cancelAnimationFrame = ((id: number) => {
    const handle = pending.get(id)
    if (handle !== undefined) {
      clearTimeout(handle)
      pending.delete(id)
    }
  }) as typeof cancelAnimationFrame
})

afterEach(() => cleanup())
