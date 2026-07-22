import type { Task } from './tasks'

/**
 * Fields the sidebar actually renders / filters on.
 * Ignores live stream blobs so token patches do not re-render the task list.
 */
export function sidebarTaskSignature(task: Task): string {
  const tags = (task.tags ?? []).join('\u0001')
  // Search matches title / tags / message bodies — not live stream text.
  const messageSig = task.messages
    .map((message) => `${message.role}:${message.content.length}:${message.content.slice(0, 48)}`)
    .join('\u0002')
  return [
    task.id,
    task.title,
    task.status,
    task.pinned ? '1' : '0',
    task.archived ? '1' : '0',
    String(task.updatedAt),
    tags,
    messageSig,
  ].join('\u0000')
}

export function sidebarTasksEqual(a: Task[], b: Task[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (sidebarTaskSignature(a[i]) !== sidebarTaskSignature(b[i])) return false
  }
  return true
}
