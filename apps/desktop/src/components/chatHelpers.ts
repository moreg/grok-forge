import type { AcpUiEvent } from '../lib/desktopBridge'

export function asEvents(value: unknown[]): AcpUiEvent[] {
  return value.filter((entry): entry is AcpUiEvent => {
    if (entry === null || typeof entry !== 'object') return false
    const kind = (entry as { kind?: unknown }).kind
    // Only tool/plan rows are rendered in the live event list.
    return kind === 'tool' || kind === 'plan'
  })
}

/** Merge tool updates by toolCallId (and replace the latest plan) so the live list does not grow unbounded. */
export function mergeLiveEvent(events: unknown[], event: AcpUiEvent): unknown[] {
  if (event.kind === 'tool' && event.toolCallId) {
    const index = events.findIndex((entry) => {
      if (entry === null || typeof entry !== 'object') return false
      const row = entry as { kind?: unknown; toolCallId?: unknown }
      return row.kind === 'tool' && row.toolCallId === event.toolCallId
    })
    if (index >= 0) {
      const next = events.slice()
      next[index] = event
      return next
    }
  }
  if (event.kind === 'plan') {
    const index = events.findIndex((entry) => {
      if (entry === null || typeof entry !== 'object') return false
      return (entry as { kind?: unknown }).kind === 'plan'
    })
    if (index >= 0) {
      const next = events.slice()
      next[index] = event
      return next
    }
  }
  return [...events, event]
}

export function thoughtPreview(text: string, max = 72): string {
  const flat = text.trim().replace(/\s+/g, ' ')
  if (flat.length <= max) return flat
  return `${flat.slice(0, max)}…`
}

export function isToolFailedStatus(status: string) {
  return status === 'failed' || status === 'error' || status === 'cancelled'
}

export function isToolDoneStatus(status: string) {
  return status === 'completed' || status === 'done' || isToolFailedStatus(status)
}

export function isToolRunningStatus(status: string) {
  return status === 'in_progress' || status === 'running' || status === 'pending'
}
