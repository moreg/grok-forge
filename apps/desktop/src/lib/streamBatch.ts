/**
 * Coalesce high-frequency stream tokens (message / thought) into one React
 * update per animation frame so the UI is not re-rendered on every chunk.
 */

export type StreamBatchPayload = {
  taskId: string
  message: string
  thought: string
}

export type StreamBatcherOptions = {
  /** Apply coalesced text to app state. */
  flush: (batch: StreamBatchPayload) => void
  /** Schedule a flush (defaults to requestAnimationFrame). */
  schedule?: (cb: () => void) => number
  /** Cancel a scheduled flush (defaults to cancelAnimationFrame). */
  cancel?: (handle: number) => void
}

export type StreamBatcher = {
  pushMessage: (taskId: string, text: string) => void
  pushThought: (taskId: string, text: string) => void
  /** Immediately apply any buffered text (call before finalize / stop). */
  flushNow: () => void
  /** Drop buffer without applying (e.g. on disconnect). */
  reset: () => void
  /** Test helper: whether a flush is already scheduled. */
  isScheduled: () => boolean
  /** Test helper: current buffer snapshot. */
  peek: () => StreamBatchPayload
}

function defaultSchedule(cb: () => void): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb)
  }
  return setTimeout(cb, 16) as unknown as number
}

function defaultCancel(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

export function createStreamBatcher(options: StreamBatcherOptions): StreamBatcher {
  const schedule = options.schedule ?? defaultSchedule
  const cancel = options.cancel ?? defaultCancel

  let taskId = ''
  let message = ''
  let thought = ''
  let handle: number | null = null

  const apply = () => {
    handle = null
    if (!taskId || (!message && !thought)) {
      message = ''
      thought = ''
      return
    }
    const batch: StreamBatchPayload = { taskId, message, thought }
    message = ''
    thought = ''
    options.flush(batch)
  }

  const ensureScheduled = () => {
    if (handle != null) return
    handle = schedule(apply)
  }

  return {
    pushMessage(id, text) {
      if (!text) return
      taskId = id
      message += text
      ensureScheduled()
    },
    pushThought(id, text) {
      if (!text) return
      taskId = id
      thought += text
      ensureScheduled()
    },
    flushNow() {
      if (handle != null) {
        cancel(handle)
        handle = null
      }
      apply()
    },
    reset() {
      if (handle != null) {
        cancel(handle)
        handle = null
      }
      taskId = ''
      message = ''
      thought = ''
    },
    isScheduled() {
      return handle != null
    },
    peek() {
      return { taskId, message, thought }
    },
  }
}
