/**
 * Coalesce workspace (git/status) reloads so tool storms and poll ticks
 * do not hammer `loadWorkspaceData` / local git.
 */

export const WORKSPACE_POLL_MS = 2_500
export const WORKSPACE_MIN_INTERVAL_MS = 900

export type WorkspaceRefreshController = {
  /** Request a refresh (throttled + coalesced). */
  request: () => void
  /** Bypass min-interval (still coalesces in-flight). Use for user-triggered refresh. */
  requestNow: () => void
  startPolling: (intervalMs?: number) => void
  stop: () => void
}

export type WorkspaceRefreshOptions = {
  load: () => Promise<void>
  minIntervalMs?: number
  now?: () => number
  schedule?: (cb: () => void, ms: number) => number
  cancel?: (id: number) => void
}

export function createWorkspaceRefreshController(
  options: WorkspaceRefreshOptions,
): WorkspaceRefreshController {
  const minIntervalMs = options.minIntervalMs ?? WORKSPACE_MIN_INTERVAL_MS
  const now = options.now ?? Date.now
  const schedule = options.schedule
    ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown as number)
  const cancel = options.cancel
    ?? ((id) => window.clearTimeout(id))

  let lastLoadAt = 0
  let inFlight = false
  let dirty = false
  let throttleTimer: number | null = null
  let pollTimer: number | null = null

  const clearThrottle = () => {
    if (throttleTimer != null) {
      cancel(throttleTimer)
      throttleTimer = null
    }
  }

  const run = async (force = false) => {
    if (inFlight) {
      dirty = true
      return
    }
    const elapsed = now() - lastLoadAt
    if (!force && elapsed < minIntervalMs) {
      dirty = true
      if (throttleTimer == null) {
        throttleTimer = schedule(() => {
          throttleTimer = null
          void run(false)
        }, minIntervalMs - elapsed)
      }
      return
    }

    clearThrottle()
    dirty = false
    inFlight = true
    lastLoadAt = now()
    try {
      await options.load()
    } finally {
      inFlight = false
      if (dirty) {
        // Trailing refresh after a burst during the previous load.
        dirty = false
        void run(true)
      }
    }
  }

  return {
    request: () => {
      void run(false)
    },
    requestNow: () => {
      clearThrottle()
      void run(true)
    },
    startPolling: (intervalMs = WORKSPACE_POLL_MS) => {
      if (pollTimer != null) return
      // First poll after one interval (connect already loads once).
      pollTimer = schedule(function tick() {
        void run(false)
        pollTimer = schedule(tick, intervalMs)
      }, intervalMs)
    },
    stop: () => {
      clearThrottle()
      if (pollTimer != null) {
        cancel(pollTimer)
        pollTimer = null
      }
      dirty = false
    },
  }
}
