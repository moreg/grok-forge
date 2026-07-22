import type { AcpUiEvent } from '../lib/desktopBridge'
import type { ChatMessage, Task } from '../lib/tasks'

export type ReviewFile = {
  shortName: string
  path: string
  additions: number
  deletions: number
  diff: Array<{ type: 'same' | 'add' | 'remove'; old: string; next: string; value: string }>
}

export type TaskPatch = Partial<Task> & {
  appendLiveMessage?: string
  appendLiveThought?: string
  appendLiveEvent?: AcpUiEvent
  finalizeAssistant?: boolean
  appendMessage?: ChatMessage
  mergeTool?: Extract<AcpUiEvent, { kind: 'tool' }>
  /** ACP plan entries to merge into planSteps (preserves tool rows + timestamps). */
  mergePlan?: unknown[]
}

export type OverlayPanel = 'none' | 'settings' | 'extensions' | 'commands' | 'sessions' | 'search'

export type PendingPermission = Extract<AcpUiEvent, { kind: 'permission' }>
