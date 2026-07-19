export type DiffLine = {
  type: 'same' | 'add' | 'remove'
  old: string
  next: string
  value: string
}

export type DiffHunk = {
  id: string
  title: string
  lines: DiffLine[]
  additions: number
  deletions: number
}

/** Rebuild pre-image text from a simplified line-level review diff. */
export function reconstructOriginal(diff: DiffLine[]) {
  return diff
    .filter((line) => line.type === 'same' || line.type === 'remove')
    .map((line) => line.value)
    .join('\n')
}

/** Rebuild post-image text from a simplified line-level review diff. */
export function reconstructUpdated(diff: DiffLine[]) {
  return diff
    .filter((line) => line.type === 'same' || line.type === 'add')
    .map((line) => line.value)
    .join('\n')
}

export function summarizeFileAction(path: string, action: 'accept' | 'reject') {
  return action === 'accept'
    ? `已接受并暂存 ${path}（git add，未 commit）。`
    : `已还原 ${path} 到修改前版本。`
}

/**
 * Stable fingerprint of workspace file list for review UI.
 * Used so poll-driven `files` array identity changes do not wipe accept/reject state.
 */
export function workspaceFilesFingerprint(
  files: Array<{ path: string; additions?: number; deletions?: number; patch?: string | null }>,
): string {
  return [...files]
    .map((file) => {
      const patch = file.patch ?? ''
      // Length + cheap ends hash keeps fingerprint short while catching content edits.
      const patchSig = `${patch.length}:${patch.slice(0, 48)}:${patch.slice(-48)}`
      return `${file.path}\0${file.additions ?? 0}\0${file.deletions ?? 0}\0${patchSig}`
    })
    .sort()
    .join('\n')
}

/** Paths to stage when confirming a review: preferred accepted set, else non-rejected files. */
export function pathsToStageOnConfirm(
  files: Array<{ path: string }>,
  acceptedPaths: string[],
  rejectedPaths: string[],
): string[] {
  if (acceptedPaths.length > 0) {
    return [...new Set(acceptedPaths.filter((path) => files.some((file) => file.path === path)))]
  }
  return files
    .map((file) => file.path)
    .filter((path) => !rejectedPaths.includes(path))
}

export function summarizeReviewStage(succeeded: number, failed: number) {
  if (succeeded === 0 && failed === 0) {
    return '已确认审阅：没有需要暂存的文件。'
  }
  if (failed === 0) {
    return `已确认审阅并暂存 ${succeeded} 个文件（git add，未自动 commit）。`
  }
  if (succeeded === 0) {
    return `确认审阅时暂存失败（${failed} 个文件）。请检查 git 是否可用。`
  }
  return `已确认审阅：成功暂存 ${succeeded} 个，失败 ${failed} 个（未自动 commit）。`
}

export function summarizeReviewRestore(succeeded: number, failed: number) {
  if (succeeded === 0 && failed === 0) {
    return '没有可还原的文件。'
  }
  if (failed === 0) {
    return `已在本地还原 ${succeeded} 个文件的未提交改动。`
  }
  if (succeeded === 0) {
    return `本地还原失败（${failed} 个文件），将尝试向 Grok 发送撤销请求。`
  }
  return `已本地还原 ${succeeded} 个文件，另有 ${failed} 个失败（可再让 Grok 处理）。`
}

function patchPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Convert a simplified line-level review diff into a unified patch for one file.
 * Synthesizes a single @@ hunk from the available line numbers.
 */
export function toUnifiedPatch(path: string, diff: DiffLine[]): string {
  const normalized = patchPath(path)
  if (diff.length === 0) {
    return [
      `--- a/${normalized}`,
      `+++ b/${normalized}`,
      '',
    ].join('\n')
  }

  let oldCount = 0
  let newCount = 0
  for (const line of diff) {
    if (line.type === 'same' || line.type === 'remove') oldCount += 1
    if (line.type === 'same' || line.type === 'add') newCount += 1
  }

  const firstOld = diff.find((line) => line.old !== '')
  const firstNew = diff.find((line) => line.next !== '')
  const oldStart = Math.max(1, Number(firstOld?.old) || 1)
  const newStart = Math.max(1, Number(firstNew?.next) || 1)

  const body = diff.map((line) => {
    if (line.type === 'add') return `+${line.value}`
    if (line.type === 'remove') return `-${line.value}`
    return ` ${line.value}`
  })

  return [
    `--- a/${normalized}`,
    `+++ b/${normalized}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...body,
    '',
  ].join('\n')
}

/** Join multiple file patches into one multi-file unified diff. */
export function toMultiFilePatch(files: Array<{ path: string; diff: DiffLine[] }>): string {
  return files
    .map((file) => toUnifiedPatch(file.path, file.diff).trimEnd())
    .filter(Boolean)
    .join('\n')
    + (files.length > 0 ? '\n' : '')
}

export function patchExportFilename(pathOrLabel?: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  if (!pathOrLabel) return `grok-changes-${stamp}.patch`
  const base = pathOrLabel
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'changes'
  return `grok-${base}-${stamp}.patch`
}

export function summarizePatchExport(fileCount: number, path?: string) {
  if (fileCount <= 1 && path) return `已导出 ${path} 的 patch。`
  return `已导出 ${fileCount} 个文件的 patch。`
}

export function summarizePatchCopy(fileCount: number, path?: string) {
  if (fileCount <= 1 && path) return `已复制 ${path} 的 patch 到剪贴板。`
  return `已复制 ${fileCount} 个文件的 patch 到剪贴板。`
}

export function summarizeHunkAction(path: string, hunkId: string, action: 'accept' | 'reject') {
  return action === 'accept'
    ? `已接受 ${path} 的片段 ${hunkId}。`
    : `已拒绝并尝试还原 ${path} 的片段 ${hunkId}。`
}

/**
 * Split a flat line-level diff into hunks: each contiguous change region
 * (add/remove) with a little surrounding context is one hunk.
 */
/** Collapse runs of whitespace so indentation/trailing space noise can be ignored. */
export function normalizeWhitespace(value: string) {
  return value.replace(/[ \t]+/g, ' ').replace(/^ | $/g, '')
}

/**
 * Soften whitespace-only changes for review display.
 * Matching remove/add pairs with the same normalized content become `same`.
 * Pure whitespace-only add/remove lines with empty trim are dropped.
 */
export function applyIgnoreWhitespace(diff: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = []
  let i = 0
  while (i < diff.length) {
    const line = diff[i]
    if (line.type === 'same') {
      out.push(line)
      i += 1
      continue
    }

    const removes: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < diff.length && diff[i].type === 'remove') {
      removes.push(diff[i])
      i += 1
    }
    while (i < diff.length && diff[i].type === 'add') {
      adds.push(diff[i])
      i += 1
    }

    if (removes.length === adds.length && removes.length > 0) {
      let allMatch = true
      for (let j = 0; j < removes.length; j += 1) {
        if (normalizeWhitespace(removes[j].value) !== normalizeWhitespace(adds[j].value)) {
          allMatch = false
          break
        }
      }
      if (allMatch) {
        for (let j = 0; j < adds.length; j += 1) {
          out.push({
            type: 'same',
            old: removes[j].old || String(j + 1),
            next: adds[j].next || removes[j].old || String(j + 1),
            value: adds[j].value,
          })
        }
        continue
      }
    }

    for (const remove of removes) {
      if (remove.value.trim() === '' && normalizeWhitespace(remove.value) === '') continue
      out.push(remove)
    }
    for (const add of adds) {
      if (add.value.trim() === '' && normalizeWhitespace(add.value) === '') continue
      out.push(add)
    }
  }
  return out
}

/** Count remaining add/remove lines after optional whitespace filtering. */
export function countDiffChanges(diff: DiffLine[]) {
  let additions = 0
  let deletions = 0
  for (const line of diff) {
    if (line.type === 'add') additions += 1
    if (line.type === 'remove') deletions += 1
  }
  return { additions, deletions }
}

export type DiffViewBlock =
  | { kind: 'line'; line: DiffLine }
  | { kind: 'fold'; id: string; count: number }

export type FoldUnchangedOptions = {
  /** Minimum consecutive unchanged lines before folding the middle. Default 6. */
  minCollapse?: number
  /** Unchanged lines kept on each edge of a long same-run. Default 2. */
  edgeContext?: number
  /** Expanded fold ids (stable: fold-{start}-{end}). */
  expandedIds?: ReadonlySet<string> | readonly string[]
}

function asExpandedSet(expandedIds?: ReadonlySet<string> | readonly string[]) {
  if (!expandedIds) return new Set<string>()
  return expandedIds instanceof Set ? expandedIds : new Set(expandedIds)
}

/**
 * Fold long runs of unchanged (`same`) lines for compact review display.
 * Keeps a little edge context around each fold so surrounding code stays readable.
 */
export function foldUnchangedDiff(
  lines: DiffLine[],
  options: FoldUnchangedOptions = {},
): DiffViewBlock[] {
  const minCollapse = options.minCollapse ?? 6
  const edgeContext = Math.max(0, options.edgeContext ?? 2)
  const expanded = asExpandedSet(options.expandedIds)
  const out: DiffViewBlock[] = []
  let i = 0

  while (i < lines.length) {
    if (lines[i].type !== 'same') {
      out.push({ kind: 'line', line: lines[i] })
      i += 1
      continue
    }

    const start = i
    while (i < lines.length && lines[i].type === 'same') i += 1
    const run = lines.slice(start, i)
    const end = i

    if (run.length < minCollapse || edgeContext * 2 >= run.length) {
      for (const line of run) out.push({ kind: 'line', line })
      continue
    }

    const id = `fold-${start}-${end}`
    if (expanded.has(id)) {
      for (const line of run) out.push({ kind: 'line', line })
      continue
    }

    const head = run.slice(0, edgeContext)
    const tail = run.slice(run.length - edgeContext)
    const hidden = run.length - head.length - tail.length
    for (const line of head) out.push({ kind: 'line', line })
    if (hidden > 0) out.push({ kind: 'fold', id, count: hidden })
    for (const line of tail) out.push({ kind: 'line', line })
  }

  return out
}

export function summarizeFoldedLines(count: number) {
  return `⋯ 隐藏 ${count} 行未改动上下文`
}

/** Expand folded blocks back into a flat line list (for consumers that only want lines). */
export function flattenDiffViewBlocks(blocks: DiffViewBlock[]): DiffLine[] {
  return blocks.flatMap((block) => (block.kind === 'line' ? [block.line] : []))
}

export function splitDiffIntoHunks(diff: DiffLine[], context = 2): DiffHunk[] {
  if (diff.length === 0) return []

  const changeIndexes = diff
    .map((line, index) => (line.type === 'add' || line.type === 'remove' ? index : -1))
    .filter((index) => index >= 0)

  if (changeIndexes.length === 0) {
    return [{
      id: 'h1',
      title: '上下文',
      lines: diff,
      additions: 0,
      deletions: 0,
    }]
  }

  const ranges: Array<{ start: number; end: number }> = []
  let start = Math.max(0, changeIndexes[0] - context)
  let end = Math.min(diff.length, changeIndexes[0] + context + 1)

  for (let i = 1; i < changeIndexes.length; i += 1) {
    const index = changeIndexes[i]
    const nextStart = Math.max(0, index - context)
    if (nextStart <= end) {
      end = Math.min(diff.length, index + context + 1)
    } else {
      ranges.push({ start, end })
      start = nextStart
      end = Math.min(diff.length, index + context + 1)
    }
  }
  ranges.push({ start, end })

  return ranges.map((range, index) => {
    const lines = diff.slice(range.start, range.end)
    const additions = lines.filter((line) => line.type === 'add').length
    const deletions = lines.filter((line) => line.type === 'remove').length
    const first = lines.find((line) => line.type !== 'same')
    const title = first?.value
      ? first.value.slice(0, 36) + (first.value.length > 36 ? '…' : '')
      : `片段 ${index + 1}`
    return {
      id: `h${index + 1}`,
      title,
      lines,
      additions,
      deletions,
    }
  })
}

function sequenceMatches(lines: string[], start: number, sequence: string[]) {
  if (sequence.length === 0) return false
  if (start + sequence.length > lines.length) return false
  for (let i = 0; i < sequence.length; i += 1) {
    if (lines[start + i] !== sequence[i]) return false
  }
  return true
}

/**
 * Reject a hunk against the current working-tree content (new image):
 * replace the hunk's new-line sequence with its old-line sequence.
 */
export function rejectHunkInContent(content: string, hunk: DiffHunk): string {
  const endsWithNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (endsWithNewline && lines[lines.length - 1] === '') lines.pop()

  const newSeq = hunk.lines
    .filter((line) => line.type === 'same' || line.type === 'add')
    .map((line) => line.value)
  const oldSeq = hunk.lines
    .filter((line) => line.type === 'same' || line.type === 'remove')
    .map((line) => line.value)

  if (newSeq.length === 0 && oldSeq.length === 0) return content

  // Prefer replacing the new sequence when present; otherwise insert old at best-effort end.
  let replaced = false
  if (newSeq.length > 0) {
    for (let i = 0; i <= lines.length - newSeq.length; i += 1) {
      if (sequenceMatches(lines, i, newSeq)) {
        lines.splice(i, newSeq.length, ...oldSeq)
        replaced = true
        break
      }
    }
  }

  if (!replaced && oldSeq.length > 0 && newSeq.length === 0) {
    // Pure deletion in the new image: re-insert old lines near surrounding context.
    const context = hunk.lines.filter((line) => line.type === 'same').map((line) => line.value)
    if (context.length > 0) {
      for (let i = 0; i <= lines.length - context.length; i += 1) {
        if (sequenceMatches(lines, i, context)) {
          lines.splice(i + context.length, 0, ...oldSeq)
          replaced = true
          break
        }
      }
    }
  }

  if (!replaced) {
    throw new Error('无法在当前文件中定位该片段，请改用整文件拒绝或让 Grok 撤销。')
  }

  const joined = lines.join('\n')
  return endsWithNewline ? `${joined}\n` : joined
}

export function applyHunkDecisionsToDiff(
  diff: DiffLine[],
  hunks: DiffHunk[],
  decisions: Record<string, 'accept' | 'reject' | undefined>,
): DiffLine[] {
  // Build a set of rejected line signatures for display: mark rejected adds as ignored, etc.
  // Display-only: return original lines with a virtual tag via filtering for preview.
  const rejected = new Set(
    hunks
      .filter((hunk) => decisions[hunk.id] === 'reject')
      .flatMap((hunk) => hunk.lines.map((line) => `${line.type}:${line.old}:${line.next}:${line.value}`)),
  )
  return diff.map((line) => {
    const key = `${line.type}:${line.old}:${line.next}:${line.value}`
    if (!rejected.has(key)) return line
    if (line.type === 'add') return { ...line, type: 'same' as const, value: line.value, old: line.next, next: line.next }
    if (line.type === 'remove') return { ...line, type: 'same' as const, value: line.value, old: line.old, next: line.old }
    return line
  })
}

/**
 * Apply all rejected hunk decisions to working-tree content.
 * Rejects are applied from bottom to top so earlier matches stay stable.
 */
export function applyHunkDecisionsToContent(
  content: string,
  hunks: DiffHunk[],
  decisions: Record<string, 'accept' | 'reject' | undefined>,
): string {
  const rejected = hunks.filter((hunk) => decisions[hunk.id] === 'reject')
  if (rejected.length === 0) return content

  let next = content
  for (const hunk of [...rejected].reverse()) {
    next = rejectHunkInContent(next, hunk)
  }
  return next
}

export function countHunkDecisions(decisions: Record<string, 'accept' | 'reject' | undefined>) {
  let accept = 0
  let reject = 0
  for (const value of Object.values(decisions)) {
    if (value === 'accept') accept += 1
    if (value === 'reject') reject += 1
  }
  return { accept, reject, total: accept + reject }
}

/** Mark every hunk with the same accept/reject decision. */
export function buildAllHunkDecisions(
  hunks: DiffHunk[],
  decision: 'accept' | 'reject',
): Record<string, 'accept' | 'reject'> {
  const next: Record<string, 'accept' | 'reject'> = {}
  for (const hunk of hunks) next[hunk.id] = decision
  return next
}

export function summarizeBatchApply(path: string, accept: number, reject: number) {
  return `已批量应用 ${path} 的片段决策：接受 ${accept}，拒绝 ${reject}。`
}

export function summarizeMarkAllHunks(path: string, count: number, decision: 'accept' | 'reject') {
  return decision === 'accept'
    ? `已将 ${path} 的 ${count} 个片段全部标记为接受。`
    : `已将 ${path} 的 ${count} 个片段全部拒绝并写回工作区。`
}

/** Build a short textual preview of what batch apply will do. */
export function previewHunkDecisions(
  hunks: DiffHunk[],
  decisions: Record<string, 'accept' | 'reject' | undefined>,
) {
  const lines: string[] = []
  for (const hunk of hunks) {
    const decision = decisions[hunk.id]
    if (!decision) {
      lines.push(`${hunk.id} · 未决策 · ${hunk.title}`)
      continue
    }
    lines.push(`${hunk.id} · ${decision === 'accept' ? '接受' : '拒绝'} · ${hunk.title} (+${hunk.additions}/−${hunk.deletions})`)
  }
  const stats = countHunkDecisions(decisions)
  lines.push(`合计：接受 ${stats.accept}，拒绝 ${stats.reject}，未决策 ${hunks.length - stats.total}`)
  return lines.join('\n')
}

export type FileDecisionEntry = {
  path: string
  shortName: string
  fileDecision: 'accept' | 'reject' | 'pending'
  additions: number
  deletions: number
  hunkTotal: number
  acceptHunks: number
  rejectHunks: number
  undecidedHunks: number
}

export type ReviewFileLike = {
  path: string
  shortName: string
  additions: number
  deletions: number
  diff: DiffLine[]
}

/**
 * Build a per-file decision checklist across the whole review set.
 * Hunk decisions are keyed by file path → hunk id.
 */
export function buildFileDecisionChecklist(
  files: ReviewFileLike[],
  acceptedPaths: string[],
  rejectedPaths: string[],
  hunkDecisionsByPath: Record<string, Record<string, 'accept' | 'reject' | undefined> | undefined> = {},
): FileDecisionEntry[] {
  return files.map((file) => {
    const hunks = splitDiffIntoHunks(file.diff)
    const decisions = hunkDecisionsByPath[file.path] ?? {}
    const stats = countHunkDecisions(decisions)
    const fileDecision = acceptedPaths.includes(file.path)
      ? 'accept' as const
      : rejectedPaths.includes(file.path)
        ? 'reject' as const
        : 'pending' as const
    return {
      path: file.path,
      shortName: file.shortName,
      fileDecision,
      additions: file.additions,
      deletions: file.deletions,
      hunkTotal: hunks.length,
      acceptHunks: stats.accept,
      rejectHunks: stats.reject,
      undecidedHunks: Math.max(0, hunks.length - stats.total),
    }
  })
}

export function summarizeFileDecisionChecklist(entries: FileDecisionEntry[]) {
  const accepted = entries.filter((entry) => entry.fileDecision === 'accept').length
  const rejected = entries.filter((entry) => entry.fileDecision === 'reject').length
  const pending = entries.length - accepted - rejected
  const acceptHunks = entries.reduce((sum, entry) => sum + entry.acceptHunks, 0)
  const rejectHunks = entries.reduce((sum, entry) => sum + entry.rejectHunks, 0)
  return {
    files: entries.length,
    accepted,
    rejected,
    pending,
    acceptHunks,
    rejectHunks,
  }
}

export function formatFileDecisionChecklist(entries: FileDecisionEntry[]) {
  if (entries.length === 0) return '暂无变更文件。'
  const lines = entries.map((entry) => {
    const fileLabel = entry.fileDecision === 'accept'
      ? '文件接受'
      : entry.fileDecision === 'reject'
        ? '文件拒绝'
        : '文件待审'
    return `${entry.shortName} · ${fileLabel} · 片段 接受 ${entry.acceptHunks}/拒绝 ${entry.rejectHunks}/未决 ${entry.undecidedHunks} · +${entry.additions}/−${entry.deletions}`
  })
  const summary = summarizeFileDecisionChecklist(entries)
  lines.push(
    `合计：${summary.files} 文件（接受 ${summary.accepted} / 拒绝 ${summary.rejected} / 待审 ${summary.pending}），片段 接受 ${summary.acceptHunks} / 拒绝 ${summary.rejectHunks}`,
  )
  return lines.join('\n')
}

export type SplitDiffRow = {
  oldNo: string
  newNo: string
  oldText: string
  newText: string
  oldKind: 'same' | 'remove' | 'empty'
  newKind: 'same' | 'add' | 'empty'
}

/**
 * Convert a unified line-level diff into side-by-side rows (old | new).
 * Removes pair with adds when consecutive; unpaired lines get empty opposite side.
 */
export function toSplitDiffRows(diff: DiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []
  let i = 0
  while (i < diff.length) {
    const line = diff[i]
    if (line.type === 'same') {
      rows.push({
        oldNo: line.old,
        newNo: line.next,
        oldText: line.value,
        newText: line.value,
        oldKind: 'same',
        newKind: 'same',
      })
      i += 1
      continue
    }

    const removes: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < diff.length && diff[i].type === 'remove') {
      removes.push(diff[i])
      i += 1
    }
    while (i < diff.length && diff[i].type === 'add') {
      adds.push(diff[i])
      i += 1
    }

    const count = Math.max(removes.length, adds.length)
    for (let index = 0; index < count; index += 1) {
      const left = removes[index]
      const right = adds[index]
      rows.push({
        oldNo: left?.old ?? '',
        newNo: right?.next ?? '',
        oldText: left?.value ?? '',
        newText: right?.value ?? '',
        oldKind: left ? 'remove' : 'empty',
        newKind: right ? 'add' : 'empty',
      })
    }
  }
  return rows
}

export function togglePinnedPath(paths: string[], path: string, max = 3): string[] {
  if (paths.includes(path)) return paths.filter((item) => item !== path)
  if (paths.length >= max) return [...paths.slice(1), path]
  return [...paths, path]
}

export type HighlightToken = {
  text: string
  kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'punct'
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case',
  'break', 'continue', 'class', 'extends', 'implements', 'import', 'export', 'from', 'default',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof',
  'interface', 'type', 'enum', 'public', 'private', 'protected', 'static', 'readonly', 'as', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'void', 'never', 'any', 'unknown', 'package', 'fn', 'mut',
  'struct', 'impl', 'trait', 'pub', 'use', 'mod', 'match', 'loop', 'def', 'self', 'cls', 'lambda',
  'with', 'yield', 'pass', 'raise', 'except', 'elif', 'and', 'or', 'not',
])

const TYPE_HINTS = new Set([
  'string', 'number', 'boolean', 'object', 'Array', 'Promise', 'Record', 'Map', 'Set', 'Error',
  'React', 'Node', 'Element', 'void', 'int', 'float', 'bool', 'str', 'list', 'dict',
])

export function languageFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) return 'ts'
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'js'
  if (['rs'].includes(ext)) return 'rs'
  if (['py'].includes(ext)) return 'py'
  if (['json'].includes(ext)) return 'json'
  if (['css', 'scss', 'less'].includes(ext)) return 'css'
  if (['md', 'markdown'].includes(ext)) return 'md'
  if (['toml', 'yml', 'yaml'].includes(ext)) return 'cfg'
  return 'text'
}

/**
 * Lightweight line highlighter for review diffs (no external deps).
 * Intentionally approximate — enough to make code changes easier to scan.
 */
export function highlightCodeLine(line: string, language = 'text'): HighlightToken[] {
  if (!line) return [{ text: ' ', kind: 'plain' }]
  if (language === 'text' || language === 'md') return [{ text: line, kind: 'plain' }]

  const tokens: HighlightToken[] = []
  let i = 0
  const push = (text: string, kind: HighlightToken['kind']) => {
    if (!text) return
    tokens.push({ text, kind })
  }

  while (i < line.length) {
    const rest = line.slice(i)

    // line comments
    if (rest.startsWith('//') || (language === 'py' && rest.startsWith('#'))) {
      push(rest, 'comment')
      break
    }
    // block comment remnants
    if (rest.startsWith('/*') || rest.startsWith('*/') || rest.startsWith('* ')) {
      const end = rest.indexOf('*/')
      if (rest.startsWith('/*') && end >= 0) {
        push(rest.slice(0, end + 2), 'comment')
        i += end + 2
        continue
      }
      push(rest, 'comment')
      break
    }

    // strings
    const quote = rest[0]
    if (quote === '"' || quote === "'" || quote === '`') {
      let j = 1
      while (j < rest.length) {
        if (rest[j] === '\\') {
          j += 2
          continue
        }
        if (rest[j] === quote) {
          j += 1
          break
        }
        j += 1
      }
      push(rest.slice(0, j), 'string')
      i += j
      continue
    }

    // numbers
    if (/^[0-9]+(\.[0-9]+)?/.test(rest)) {
      const match = rest.match(/^[0-9]+(\.[0-9]+)?/)![0]
      push(match, 'number')
      i += match.length
      continue
    }

    // identifiers / keywords
    if (/^[A-Za-z_$][\w$]*/.test(rest)) {
      const match = rest.match(/^[A-Za-z_$][\w$]*/)![0]
      const kind = KEYWORDS.has(match)
        ? 'keyword'
        : TYPE_HINTS.has(match) || /^[A-Z]/.test(match)
          ? 'type'
          : 'plain'
      push(match, kind)
      i += match.length
      continue
    }

    // punctuation / operators
    if (/^[{}()[\];,.<>:=+\-*/%&|!?@#]/.test(rest[0])) {
      push(rest[0], 'punct')
      i += 1
      continue
    }

    // whitespace / other
    const match = rest.match(/^\s+|^./)![0]
    push(match, 'plain')
    i += match.length
  }

  return tokens.length > 0 ? tokens : [{ text: line, kind: 'plain' }]
}
