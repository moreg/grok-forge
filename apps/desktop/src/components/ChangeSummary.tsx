import { ChevronRight, FileDiff } from 'lucide-react'
import type { WorkspaceData } from '../lib/grokAcpClient'

export function ChangeSummary({ workspace, onOpenReview }: { workspace: WorkspaceData | null; onOpenReview: () => void }) {
  if (!workspace || workspace.files.length === 0) return null
  const additions = workspace.files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = workspace.files.reduce((sum, file) => sum + file.deletions, 0)

  return (
    <button className="result-summary" type="button" onClick={onOpenReview} aria-label="查看改动摘要">
      <FileDiff size={13} />
      <strong>改动摘要</strong>
      <span>{workspace.files.length} 个文件</span>
      <em>+{additions}</em>
      <del>−{deletions}</del>
      <ChevronRight size={13} />
    </button>
  )
}
