import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FileDiff,
  GitBranch,
  MoreHorizontal,
  PanelRightClose,
  Plus,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  X,
} from 'lucide-react'
import {
  gitCommit,
  gitRestoreFile,
  gitRestoreFiles,
  gitStageFiles,
  listenForTerminalChunks,
  listenForTerminalExit,
  readTextFile,
  terminalKill,
  terminalList,
  terminalOpenShell,
  terminalWrite,
  writeTextFile,
  type LocalTerminal,
} from '../lib/desktopBridge'
import { copyText } from '../lib/clipboard'
import {
  applyHunkDecisionsToContent,
  applyHunkDecisionsToDiff,
  applyIgnoreWhitespace,
  buildAllHunkDecisions,
  buildFileDecisionChecklist,
  countDiffChanges,
  countHunkDecisions,
  foldUnchangedDiff,
  formatFileDecisionChecklist,
  languageFromPath,
  patchExportFilename,
  pathsToStageOnConfirm,
  previewHunkDecisions,
  rejectHunkInContent,
  splitDiffIntoHunks,
  summarizeBatchApply,
  summarizeFileAction,
  summarizeFileDecisionChecklist,
  summarizeFoldedLines,
  summarizeHunkAction,
  summarizeMarkAllHunks,
  summarizePatchCopy,
  summarizePatchExport,
  summarizeReviewRestore,
  summarizeReviewStage,
  toMultiFilePatch,
  toSplitDiffRows,
  toUnifiedPatch,
  togglePinnedPath,
  workspaceFilesFingerprint,
  type DiffHunk,
  type DiffLine,
  type DiffViewBlock,
} from '../lib/review'
import { downloadTextFile, summarizeGitCommit } from '../lib/tasks'
import type { ExportHistoryKind } from '../lib/prefs'
import type { WorkspaceData } from '../lib/grokAcpClient'
import { computeVirtualWindow, shouldVirtualize } from '../lib/virtualWindow'
import { HighlightedCode } from './HighlightedCode'
import type { ReviewFile } from './types'

function toReviewFile(file: WorkspaceData['files'][number]): ReviewFile {
  const diff: ReviewFile['diff'] = []
  let oldLine = 0
  let nextLine = 0
  for (const value of (file.patch ?? '').split('\n')) {
    const header = /^@@ -(\d+)[^ ]* \+(\d+)/.exec(value)
    if (header) { oldLine = Number(header[1]); nextLine = Number(header[2]); continue }
    if (value.startsWith('+') && !value.startsWith('+++')) diff.push({ type: 'add', old: '', next: String(nextLine++), value: value.slice(1) })
    else if (value.startsWith('-') && !value.startsWith('---')) diff.push({ type: 'remove', old: String(oldLine++), next: '', value: value.slice(1) })
    else if (value.startsWith(' ')) diff.push({ type: 'same', old: String(oldLine++), next: String(nextLine++), value: value.slice(1) })
  }
  return { shortName: file.path.split(/[\\/]/).at(-1) ?? file.path, path: file.path, additions: file.additions, deletions: file.deletions, diff }
}
export function ReviewPane({
  workspace,
  workspacePath = '',
  connected,
  onClose,
  onRequestRevert,
  onConfirmReviewed,
  onRefreshWorkspace,
  onFileActionMessage,
  onRecordExport,
}: {
  workspace: WorkspaceData | null
  /** Used to spawn a local shell in the selected workspace even before Grok connects. */
  workspacePath?: string
  connected: boolean
  onClose: () => void
  /** Fallback when local git restore fails for some/all paths — usually inject a Grok prompt. */
  onRequestRevert: (paths: string[]) => void
  onConfirmReviewed: (summary: string) => void
  onRefreshWorkspace?: () => void
  onFileActionMessage?: (message: string) => void
  onRecordExport?: (entry: {
    kind: ExportHistoryKind
    label: string
    filename: string
    content?: string
    mime?: string
  }) => void
}) {
  const files = useMemo(() => workspace?.files.map(toReviewFile) ?? [], [workspace])
  const [localTerminals, setLocalTerminals] = useState<LocalTerminal[]>([])
  const remoteTerminals = workspace?.terminals ?? []
  const terminals = useMemo(() => {
    const remote = remoteTerminals.map((item) => ({
      terminalId: item.terminalId,
      name: item.name || item.terminalId,
      status: item.status,
      exitCode: item.exitCode,
      output: item.output,
      truncated: item.truncated,
      source: 'remote' as const,
    }))
    const local = localTerminals.map((item) => ({
      ...item,
      source: 'local' as const,
    }))
    return [...local, ...remote]
  }, [localTerminals, remoteTerminals])

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTerminalKey, setSelectedTerminalKey] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'diff' | 'terminal'>('diff')
  const [reviewState, setReviewState] = useState<'pending' | 'confirmed' | 'revert-help'>('pending')
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [acceptedPaths, setAcceptedPaths] = useState<string[]>([])
  const [rejectedPaths, setRejectedPaths] = useState<string[]>([])
  const [hunkDecisionsByPath, setHunkDecisionsByPath] = useState<Record<string, Record<string, 'accept' | 'reject'>>>({})
  const [activeHunkId, setActiveHunkId] = useState<string | null>(null)
  const [previewDecisions, setPreviewDecisions] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(true)
  const [diffLayout, setDiffLayout] = useState<'unified' | 'split'>('unified')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [showAllHunks, setShowAllHunks] = useState(false)
  const [collapseUnchanged, setCollapseUnchanged] = useState(true)
  const [expandedFolds, setExpandedFolds] = useState<string[]>([])
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([])
  const [actionError, setActionError] = useState('')
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalSending, setTerminalSending] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [commitBusy, setCommitBusy] = useState(false)
  const [commitError, setCommitError] = useState('')
  const terminalOutputRef = useRef<HTMLDivElement | null>(null)
  const selected = files.find((file) => file.path === selectedPath) ?? files[0]
  const selectedLanguage = selected ? languageFromPath(selected.path) : 'text'
  const terminal = terminals.find((item) => `${item.source}:${item.terminalId}` === selectedTerminalKey) ?? terminals[0]
  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const hasChanges = files.length > 0
  const selectedAccepted = selected ? acceptedPaths.includes(selected.path) : false
  const selectedRejected = selected ? rejectedPaths.includes(selected.path) : false
  // Hunks for accept/reject always use the original diff so workspace edits stay accurate.
  const hunks = useMemo(() => (selected ? splitDiffIntoHunks(selected.diff) : []), [selected])
  const hunkDecisions = selected ? (hunkDecisionsByPath[selected.path] ?? {}) : {}
  const activeHunk: DiffHunk | null = hunks.find((hunk) => hunk.id === activeHunkId) ?? hunks[0] ?? null
  const previewLines = useMemo(() => {
    if (!selected || !previewDecisions) return null
    return applyHunkDecisionsToDiff(selected.diff, hunks, hunkDecisions)
  }, [selected, previewDecisions, hunks, hunkDecisions])
  const rawVisibleLines: DiffLine[] = previewLines
    ?? (showAllHunks ? (selected?.diff ?? []) : (activeHunk?.lines ?? selected?.diff ?? []))
  const visibleLines = useMemo(
    () => (ignoreWhitespace ? applyIgnoreWhitespace(rawVisibleLines) : rawVisibleLines),
    [ignoreWhitespace, rawVisibleLines],
  )
  const expandedFoldSet = useMemo(() => new Set(expandedFolds), [expandedFolds])
  const diffBlocks = useMemo((): DiffViewBlock[] => {
    if (!collapseUnchanged) {
      return visibleLines.map((line) => ({ kind: 'line' as const, line }))
    }
    return foldUnchangedDiff(visibleLines, { expandedIds: expandedFoldSet })
  }, [collapseUnchanged, visibleLines, expandedFoldSet])
  const visibleChangeStats = useMemo(() => countDiffChanges(visibleLines), [visibleLines])
  const decisionPreviewText = useMemo(
    () => (selected ? previewHunkDecisions(hunks, hunkDecisions) : ''),
    [selected, hunks, hunkDecisions],
  )
  const fileChecklist = useMemo(
    () => buildFileDecisionChecklist(files, acceptedPaths, rejectedPaths, hunkDecisionsByPath),
    [files, acceptedPaths, rejectedPaths, hunkDecisionsByPath],
  )
  const checklistSummary = useMemo(() => summarizeFileDecisionChecklist(fileChecklist), [fileChecklist])
  const checklistText = useMemo(() => formatFileDecisionChecklist(fileChecklist), [fileChecklist])
  const pinnedFiles = useMemo(
    () => pinnedPaths
      .map((path) => files.find((file) => file.path === path))
      .filter((file): file is ReviewFile => Boolean(file)),
    [pinnedPaths, files],
  )

  const setHunkDecision = (path: string, hunkId: string, decision: 'accept' | 'reject') => {
    setHunkDecisionsByPath((current) => ({
      ...current,
      [path]: { ...(current[path] ?? {}), [hunkId]: decision },
    }))
  }

  // Fingerprint content so 1.5s workspace polls (new array identity) do not wipe decisions.
  const filesFingerprint = useMemo(
    () => workspaceFilesFingerprint(workspace?.files ?? []),
    [workspace?.files],
  )

  useEffect(() => {
    setReviewState('pending')
    setAcceptedPaths([])
    setRejectedPaths([])
    setHunkDecisionsByPath({})
    setActiveHunkId(null)
    setActionError('')
    setPinnedPaths((current) => current.filter((path) => (workspace?.files ?? []).some((file) => file.path === path)))
  }, [filesFingerprint])

  useEffect(() => {
    setActiveHunkId(null)
    setPreviewDecisions(false)
    setShowAllHunks(false)
    setExpandedFolds([])
  }, [selected?.path])

  const toggleFold = (id: string) => {
    setExpandedFolds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const renderDiffFold = (block: Extract<DiffViewBlock, { kind: 'fold' }>) => (
    <button
      key={block.id}
      type="button"
      className="diff-fold"
      aria-label={`展开隐藏的 ${block.count} 行上下文`}
      onClick={() => toggleFold(block.id)}
    >
      {summarizeFoldedLines(block.count)}
    </button>
  )

  // Fixed-row virtualization only when every block is a line row (same 21px height).
  // Fold buttons are taller — virtualizing mixed fold/line lists mis-positions scroll.
  const DIFF_ROW_HEIGHT = 21
  const [diffScrollTop, setDiffScrollTop] = useState(0)
  const [diffViewportHeight, setDiffViewportHeight] = useState(480)
  const diffScrollRef = useRef<HTMLDivElement | null>(null)
  const hasFoldBlocks = useMemo(
    () => diffBlocks.some((block) => block.kind === 'fold'),
    [diffBlocks],
  )
  const virtualizeDiff = shouldVirtualize(diffBlocks.length, 80) && !hasFoldBlocks
  const diffWindow = useMemo(
    () => computeVirtualWindow({
      itemCount: diffBlocks.length,
      itemHeight: DIFF_ROW_HEIGHT,
      scrollTop: diffScrollTop,
      viewportHeight: diffViewportHeight,
      overscan: 12,
    }),
    [diffBlocks.length, diffScrollTop, diffViewportHeight],
  )
  const visibleDiffBlocks = virtualizeDiff
    ? diffBlocks.slice(diffWindow.start, diffWindow.end)
    : diffBlocks

  useEffect(() => {
    // Reset scroll bookkeeping when the file / layout changes.
    setDiffScrollTop(0)
    if (diffScrollRef.current) diffScrollRef.current.scrollTop = 0
  }, [selected?.path, diffLayout, showAllHunks, activeHunkId, collapseUnchanged, previewDecisions])

  useEffect(() => {
    const el = diffScrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (typeof height === 'number' && height > 0) setDiffViewportHeight(height)
    })
    ro.observe(el)
    setDiffViewportHeight(el.clientHeight || 480)
    return () => ro.disconnect()
  }, [diffLayout, Boolean(selected)])

  const onDiffScroll = (event: UIEvent<HTMLDivElement>) => {
    setDiffScrollTop(event.currentTarget.scrollTop)
  }

  const renderDiffBlock = (block: DiffViewBlock, index: number) => {
    if (block.kind === 'fold') return renderDiffFold(block)
    if (diffLayout === 'split') {
      const rows = toSplitDiffRows([block.line])
      const row = rows[0]
      if (!row) return null
      return (
        <div className="split-row" key={`${row.oldNo}-${row.newNo}-${index}`} style={{ height: DIFF_ROW_HEIGHT }}>
          <div className={`split-cell ${row.oldKind}`}>
            <span className="line-no">{row.oldNo}</span>
            <HighlightedCode text={row.oldText || ' '} language={selectedLanguage} />
          </div>
          <div className={`split-cell ${row.newKind}`}>
            <span className="line-no">{row.newNo}</span>
            <HighlightedCode text={row.newText || ' '} language={selectedLanguage} />
          </div>
        </div>
      )
    }
    const line = block.line
    return (
      <div
        className={`diff-line ${line.type}`}
        key={`${line.next}-${line.old}-${index}`}
        style={{ height: DIFF_ROW_HEIGHT }}
      >
        <span className="line-no">{line.old}</span>
        <span className="line-no">{line.next}</span>
        <span className="diff-prefix">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span>
        <HighlightedCode text={line.value || ' '} language={selectedLanguage} />
      </div>
    )
  }

  useEffect(() => {
    if (!terminals.some((item) => `${item.source}:${item.terminalId}` === selectedTerminalKey)) {
      const first = terminals[0]
      setSelectedTerminalKey(first ? `${first.source}:${first.terminalId}` : null)
    }
  }, [terminals, selectedTerminalKey])

  const refreshLocalTerminals = useCallback(async () => {
    try {
      setLocalTerminals(await terminalList())
    } catch {
      setLocalTerminals([])
    }
  }, [])

  useEffect(() => {
    void refreshLocalTerminals()
    if (!connected) return
    const timer = window.setInterval(() => { void refreshLocalTerminals() }, 2_000)
    return () => window.clearInterval(timer)
  }, [connected, refreshLocalTerminals])

  useEffect(() => {
    let unlistenChunk: (() => void) | undefined
    let unlistenExit: (() => void) | undefined
    void listenForTerminalChunks((event) => {
      setLocalTerminals((current) => {
        const existing = current.find((item) => item.terminalId === event.terminalId)
        if (!existing) {
          return [
            ...current,
            {
              terminalId: event.terminalId,
              name: event.terminalId,
              status: 'running',
              output: event.chunk,
              truncated: false,
            },
          ]
        }
        return current.map((item) => (
          item.terminalId === event.terminalId
            ? { ...item, status: 'running', output: `${item.output}${event.chunk}` }
            : item
        ))
      })
    }).then((fn) => { unlistenChunk = fn })
    void listenForTerminalExit((event) => {
      setLocalTerminals((current) => current.map((item) => (
        item.terminalId === event.terminalId ? { ...item, status: 'exited' } : item
      )))
    }).then((fn) => { unlistenExit = fn })
    return () => {
      unlistenChunk?.()
      unlistenExit?.()
    }
  }, [])

  const copySelectedPath = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected.path)
    } catch {
      // ignore
    }
    setFileMenuOpen(false)
  }

  const exportSelectedPatch = () => {
    if (!selected) return
    const patch = toUnifiedPatch(selected.path, selected.diff)
    const filename = patchExportFilename(selected.path)
    const mime = 'text/x-patch;charset=utf-8'
    downloadTextFile(filename, patch, mime)
    onRecordExport?.({ kind: 'patch', label: selected.path, filename, content: patch, mime })
    onFileActionMessage?.(summarizePatchExport(1, selected.path))
    setFileMenuOpen(false)
  }

  const exportAllPatches = () => {
    if (files.length === 0) return
    const patch = toMultiFilePatch(files.map((file) => ({ path: file.path, diff: file.diff })))
    const filename = patchExportFilename('all-changes')
    const mime = 'text/x-patch;charset=utf-8'
    downloadTextFile(filename, patch, mime)
    onRecordExport?.({ kind: 'patch-all', label: `${files.length} 个文件`, filename, content: patch, mime })
    onFileActionMessage?.(summarizePatchExport(files.length))
    setFileMenuOpen(false)
  }

  const copySelectedPatch = async () => {
    if (!selected) return
    const patch = toUnifiedPatch(selected.path, selected.diff)
    try {
      await navigator.clipboard.writeText(patch)
      onRecordExport?.({
        kind: 'patch-copy',
        label: selected.path,
        filename: patchExportFilename(selected.path),
        content: patch,
        mime: 'text/x-patch;charset=utf-8',
      })
      onFileActionMessage?.(summarizePatchCopy(1, selected.path))
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制 patch 失败')
    }
    setFileMenuOpen(false)
  }

  const copyAllPatches = async () => {
    if (files.length === 0) return
    const patch = toMultiFilePatch(files.map((file) => ({ path: file.path, diff: file.diff })))
    try {
      await navigator.clipboard.writeText(patch)
      onRecordExport?.({
        kind: 'patch-copy-all',
        label: `${files.length} 个文件`,
        filename: patchExportFilename('all-changes'),
        content: patch,
        mime: 'text/x-patch;charset=utf-8',
      })
      onFileActionMessage?.(summarizePatchCopy(files.length))
      setActionError('')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制 patch 失败')
    }
    setFileMenuOpen(false)
  }

  const acceptSelectedFile = async () => {
    if (!selected) return
    setActionError('')
    try {
      const staged = await gitStageFiles([selected.path])
      if (staged.failed > 0) {
        const detail = staged.results.find((row) => !row.ok)?.error
        throw new Error(detail || `暂存失败：${selected.path}`)
      }
      setAcceptedPaths((current) => [...new Set([...current, selected.path])])
      setRejectedPaths((current) => current.filter((path) => path !== selected.path))
      onFileActionMessage?.(summarizeFileAction(selected.path, 'accept'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
    setFileMenuOpen(false)
  }

  const rejectSelectedFile = async () => {
    if (!selected) return
    setActionError('')
    try {
      await gitRestoreFile(selected.path)
      setRejectedPaths((current) => [...new Set([...current, selected.path])])
      setAcceptedPaths((current) => current.filter((path) => path !== selected.path))
      onFileActionMessage?.(summarizeFileAction(selected.path, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      onRequestRevert([selected.path])
      setReviewState('revert-help')
    }
    setFileMenuOpen(false)
  }

  const confirmReviewed = async () => {
    if (!hasChanges || reviewState === 'confirmed') return
    setActionError('')
    const paths = pathsToStageOnConfirm(files, acceptedPaths, rejectedPaths)
    try {
      if (paths.length > 0) {
        const staged = await gitStageFiles(paths)
        const summary = summarizeReviewStage(staged.succeeded, staged.failed)
        if (staged.failed > 0 && staged.succeeded === 0) {
          setActionError(summary)
          onFileActionMessage?.(summary)
          return
        }
        if (staged.succeeded > 0) {
          setAcceptedPaths((current) => [...new Set([...current, ...staged.results.filter((r) => r.ok).map((r) => r.path)])])
        }
        setReviewState('confirmed')
        onConfirmReviewed(summary)
        onRefreshWorkspace?.()
        if (staged.failed > 0) setActionError(summary)
      } else {
        const summary = summarizeReviewStage(0, 0)
        setReviewState('confirmed')
        onConfirmReviewed(summary)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      onFileActionMessage?.(message)
    }
  }

  const openCommitDialog = () => {
    setCommitError('')
    if (!commitMessage.trim()) {
      const names = files.slice(0, 3).map((file) => file.shortName).join(', ')
      setCommitMessage(names ? `更新 ${names}${files.length > 3 ? ' 等' : ''}` : '')
    }
    setCommitOpen(true)
  }

  const submitCommit = async () => {
    const message = commitMessage.trim()
    if (!message) {
      setCommitError('提交说明不能为空')
      return
    }
    setCommitBusy(true)
    setCommitError('')
    try {
      // Only commit paths accepted (or not rejected) in this review set.
      const paths = hasChanges
        ? pathsToStageOnConfirm(files, acceptedPaths, rejectedPaths)
        : []
      if (paths.length === 0) {
        throw new Error('没有可提交的文件（请先接受改动或确认审阅）')
      }
      const staged = await gitStageFiles(paths)
      if (staged.failed > 0 && staged.succeeded === 0) {
        throw new Error(summarizeReviewStage(staged.succeeded, staged.failed))
      }
      if (staged.succeeded > 0) {
        setAcceptedPaths((current) => [...new Set([...current, ...staged.results.filter((r) => r.ok).map((r) => r.path)])])
        if (reviewState !== 'confirmed') {
          setReviewState('confirmed')
          onConfirmReviewed(summarizeReviewStage(staged.succeeded, staged.failed))
        }
      }
      // Prefer successfully staged paths; fall back to intended list for path-limited commit.
      const commitPaths = staged.results.filter((row) => row.ok).map((row) => row.path)
      const result = await gitCommit(message, commitPaths.length > 0 ? commitPaths : paths)
      const summary = summarizeGitCommit(message, result.ok, result.error)
      if (!result.ok) {
        setCommitError(result.error || summary)
        onFileActionMessage?.(summary)
        return
      }
      setCommitOpen(false)
      setCommitMessage('')
      setReviewState('confirmed')
      onFileActionMessage?.(summary)
      onRefreshWorkspace?.()
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setCommitError(text)
      onFileActionMessage?.(text)
    } finally {
      setCommitBusy(false)
    }
  }

  const requestRevertAll = async () => {
    if (!hasChanges || reviewState === 'confirmed') return
    const paths = files.map((file) => file.path)
    setActionError('')
    try {
      const restored = await gitRestoreFiles(paths)
      const summary = summarizeReviewRestore(restored.succeeded, restored.failed)
      onFileActionMessage?.(summary)
      if (restored.succeeded > 0) {
        setRejectedPaths((current) => [...new Set([...current, ...restored.results.filter((r) => r.ok).map((r) => r.path)])])
        setAcceptedPaths((current) => current.filter((path) => !restored.results.some((r) => r.ok && r.path === path)))
        onRefreshWorkspace?.()
      }
      const failedPaths = restored.results.filter((r) => !r.ok).map((r) => r.path)
      if (restored.failed > 0) {
        setActionError(summary)
        if (failedPaths.length > 0) {
          onRequestRevert(failedPaths)
          setReviewState('revert-help')
        }
      } else {
        setReviewState('revert-help')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      onRequestRevert(paths)
      setReviewState('revert-help')
    }
  }

  const acceptHunk = (hunk: DiffHunk) => {
    if (!selected) return
    setHunkDecision(selected.path, hunk.id, 'accept')
    onFileActionMessage?.(summarizeHunkAction(selected.path, hunk.id, 'accept'))
  }

  const rejectHunk = async (hunk: DiffHunk) => {
    if (!selected) return
    setActionError('')
    try {
      const content = await readTextFile(selected.path)
      const next = rejectHunkInContent(content, hunk)
      await writeTextFile(selected.path, next)
      setHunkDecision(selected.path, hunk.id, 'reject')
      onFileActionMessage?.(summarizeHunkAction(selected.path, hunk.id, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const applyAllHunkDecisions = async () => {
    if (!selected) return
    const stats = countHunkDecisions(hunkDecisions)
    if (stats.total === 0) {
      setActionError('请先对至少一个片段选择接受或拒绝。')
      return
    }
    setActionError('')
    try {
      if (stats.reject > 0) {
        const content = await readTextFile(selected.path)
        const next = applyHunkDecisionsToContent(content, hunks, hunkDecisions)
        await writeTextFile(selected.path, next)
      }
      onFileActionMessage?.(summarizeBatchApply(selected.path, stats.accept, stats.reject))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const acceptAllHunks = () => {
    if (!selected || hunks.length === 0) return
    setHunkDecisionsByPath((current) => ({
      ...current,
      [selected.path]: buildAllHunkDecisions(hunks, 'accept'),
    }))
    setActionError('')
    onFileActionMessage?.(summarizeMarkAllHunks(selected.path, hunks.length, 'accept'))
  }

  const rejectAllHunks = async () => {
    if (!selected || hunks.length === 0) return
    setActionError('')
    const decisions = buildAllHunkDecisions(hunks, 'reject')
    try {
      const content = await readTextFile(selected.path)
      const next = applyHunkDecisionsToContent(content, hunks, decisions)
      await writeTextFile(selected.path, next)
      setHunkDecisionsByPath((current) => ({
        ...current,
        [selected.path]: decisions,
      }))
      onFileActionMessage?.(summarizeMarkAllHunks(selected.path, hunks.length, 'reject'))
      onRefreshWorkspace?.()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const killLocalTerminal = async (terminalId: string) => {
    try {
      await terminalKill(terminalId)
      await refreshLocalTerminals()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const canWriteTerminal = Boolean(
    terminal
    && terminal.source === 'local'
    && terminal.interactive
    && terminal.status !== 'exited',
  )

  const openLocalShell = async () => {
    setActionError('')
    try {
      if (!workspacePath.trim()) {
        throw new Error('请先选择工作区，再新建本地终端。')
      }
      const terminalId = await terminalOpenShell(workspacePath)
      await refreshLocalTerminals()
      setSelectedTerminalKey(`local:${terminalId}`)
      setActiveTab('terminal')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }

  const sendTerminalLine = async () => {
    if (!terminal || terminal.source !== 'local' || !canWriteTerminal) return
    const line = terminalInput
    if (!line.trim()) return
    setTerminalSending(true)
    setActionError('')
    try {
      await terminalWrite(terminal.terminalId, line)
      setTerminalInput('')
      // Optimistic echo (backend also records it); chunks will append process output.
      setLocalTerminals((current) => current.map((item) => (
        item.terminalId === terminal.terminalId
          ? {
            ...item,
            output: `${item.output}${item.output.endsWith('\n') || !item.output ? '' : '\n'}› ${line}\n`,
          }
          : item
      )))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setTerminalSending(false)
    }
  }

  useEffect(() => {
    const el = terminalOutputRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [terminal?.output, activeTab])

  return (
    <section className="review-pane" aria-label="变更审阅">
      <div className="review-tabs">
        <button role="tab" aria-selected={activeTab === 'diff'} className={activeTab === 'diff' ? 'active' : ''} onClick={() => setActiveTab('diff')} type="button"><FileDiff size={14} /> 变更 <span>{files.length}</span></button>
        <button role="tab" aria-selected={activeTab === 'terminal'} className={activeTab === 'terminal' ? 'active' : ''} onClick={() => setActiveTab('terminal')} type="button"><SquareTerminal size={14} /> 终端 <span>{terminals.length}</span></button>
        <button className="close-pane" aria-label="关闭审阅面板" onClick={onClose} type="button"><PanelRightClose size={16} /></button>
      </div>

      {activeTab === 'diff' ? (
        <>
          <div className={`review-summary ${hasChanges ? '' : 'is-empty'}`.trim()}>
            <div className="review-summary-main">
              <div className="review-summary-text">
                <strong>{hasChanges ? '待审阅的改动' : '变更审阅'}</strong>
                <small>
                  {workspace
                    ? hasChanges
                      ? `${files.length} 个文件已修改${workspace.branch ? ` · ${workspace.branch}` : ''}${
                        workspace.gitSource === 'local' ? ' · 本地 git' : ''
                      }`
                      : workspace.gitAvailable
                        ? `工作区干净${workspace.branch ? ` · ${workspace.branch}` : ''}${
                          workspace.gitSource === 'local' ? ' · 本地 git' : ''
                        }`
                        : 'Git 状态不可用'
                    : '连接 Grok 后显示实时 Git 变更'}
                </small>
              </div>
              {hasChanges && (
                <div className="summary-count" aria-label="变更统计">
                  <span>+{ignoreWhitespace ? visibleChangeStats.additions : additions}</span>
                  <del>−{ignoreWhitespace ? visibleChangeStats.deletions : deletions}</del>
                </div>
              )}
            </div>
            {hasChanges && (
              <div className="review-toolbar">
                <div className="review-layout-toggle" role="group" aria-label="Diff 布局">
                  <button
                    type="button"
                    className={diffLayout === 'unified' ? 'active' : ''}
                    aria-pressed={diffLayout === 'unified'}
                    aria-label="统一 diff 视图"
                    onClick={() => setDiffLayout('unified')}
                  >
                    统一
                  </button>
                  <button
                    type="button"
                    className={diffLayout === 'split' ? 'active' : ''}
                    aria-pressed={diffLayout === 'split'}
                    aria-label="并排 diff 视图"
                    onClick={() => setDiffLayout('split')}
                  >
                    并排
                  </button>
                </div>
                <div className="review-view-toggles" role="group" aria-label="Diff 视图">
                  <button
                    type="button"
                    className={ignoreWhitespace ? 'active' : ''}
                    aria-pressed={ignoreWhitespace}
                    aria-label="忽略空白差异"
                    onClick={() => setIgnoreWhitespace((value) => !value)}
                  >
                    忽略空白
                  </button>
                  <button
                    type="button"
                    className={showAllHunks ? 'active' : ''}
                    aria-pressed={showAllHunks}
                    aria-label="展开全部片段"
                    onClick={() => setShowAllHunks((value) => !value)}
                  >
                    {showAllHunks ? '按片段' : '展开全部'}
                  </button>
                  <button
                    type="button"
                    className={collapseUnchanged ? 'active' : ''}
                    aria-pressed={collapseUnchanged}
                    aria-label="折叠未改动上下文"
                    onClick={() => {
                      setCollapseUnchanged((value) => !value)
                      setExpandedFolds([])
                    }}
                  >
                    折叠上下文
                  </button>
                </div>
                <button
                  type="button"
                  className="review-refresh"
                  aria-label="刷新变更"
                  title="重新读取工作区 Git 状态"
                  onClick={() => onRefreshWorkspace?.()}
                  disabled={!workspace}
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  刷新
                </button>
              </div>
            )}
          </div>
          {files.length > 0 && (
            <div className="decision-checklist" aria-label="文件决策清单">
              <div className="decision-checklist-header">
                <button
                  type="button"
                  className="checklist-toggle"
                  aria-expanded={checklistOpen}
                  aria-label={checklistOpen ? '收起决策清单' : '展开决策清单'}
                  onClick={() => setChecklistOpen((open) => !open)}
                >
                  {checklistOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <strong>决策清单</strong>
                </button>
                <small>
                  文件 接受 {checklistSummary.accepted}/拒绝 {checklistSummary.rejected}/待审 {checklistSummary.pending}
                  {' · '}
                  片段 接受 {checklistSummary.acceptHunks}/拒绝 {checklistSummary.rejectHunks}
                </small>
              </div>
              {checklistOpen && (
                <>
                  <div className="decision-checklist-list">
                    {fileChecklist.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        className={`decision-row ${selected?.path === entry.path ? 'active' : ''} ${entry.fileDecision}`}
                        aria-label={`决策 ${entry.shortName}`}
                        onClick={() => setSelectedPath(entry.path)}
                      >
                        <FileCode2 size={13} />
                        <span className="decision-name">{entry.shortName}</span>
                        <em className={`file-tag ${entry.fileDecision === 'pending' ? '' : entry.fileDecision}`}>
                          {entry.fileDecision === 'accept' ? '文件接受' : entry.fileDecision === 'reject' ? '文件拒绝' : '待审'}
                        </em>
                        <small>
                          片段 {entry.acceptHunks}/{entry.rejectHunks}/{entry.undecidedHunks}
                        </small>
                        <em>+{entry.additions}</em>
                        {entry.deletions > 0 && <del>−{entry.deletions}</del>}
                      </button>
                    ))}
                  </div>
                  <pre className="decision-checklist-text" aria-label="决策清单摘要">{checklistText}</pre>
                </>
              )}
            </div>
          )}
          {hasChanges && (
            <div className="file-list" aria-label="变更文件列表">
              {files.map((file) => (
                <div key={file.path} className={`file-row ${selected?.path === file.path ? 'active' : ''}`}>
                  <button className="file-row-main" onClick={() => setSelectedPath(file.path)} aria-label={`查看 ${file.shortName}`} type="button">
                    <FileCode2 size={14} />
                    <span>{file.shortName}</span>
                    {acceptedPaths.includes(file.path) && <em className="file-tag accept">已接受</em>}
                    {rejectedPaths.includes(file.path) && <em className="file-tag reject">已拒绝</em>}
                    <em>+{file.additions}</em>
                    {file.deletions > 0 && <del>−{file.deletions}</del>}
                  </button>
                  <button
                    type="button"
                    className={`file-pin ${pinnedPaths.includes(file.path) ? 'active' : ''}`}
                    aria-label={pinnedPaths.includes(file.path) ? `取消固定 ${file.shortName}` : `固定对比 ${file.shortName}`}
                    aria-pressed={pinnedPaths.includes(file.path)}
                    onClick={() => setPinnedPaths((current) => togglePinnedPath(current, file.path))}
                  >
                    钉
                  </button>
                </div>
              ))}
            </div>
          )}
          {pinnedFiles.length > 0 && (
            <div className="multi-diff" aria-label="多文件对比">
              <div className="multi-diff-heading">
                <strong>并排多文件</strong>
                <small>最多固定 3 个文件</small>
                <button type="button" aria-label="清空固定文件" onClick={() => setPinnedPaths([])}>清空</button>
              </div>
              <div className={`multi-diff-grid count-${pinnedFiles.length}`}>
                {pinnedFiles.map((file) => {
                  const lines = toSplitDiffRows(file.diff).slice(0, 40)
                  return (
                    <div key={file.path} className="multi-diff-card">
                      <header>
                        <button type="button" onClick={() => setSelectedPath(file.path)}>{file.shortName}</button>
                        <em>+{file.additions}/−{file.deletions}</em>
                      </header>
                      <div className="split-diff compact" aria-label={`${file.shortName} 并排预览`}>
                        {lines.map((row, index) => (
                          <div className="split-row" key={`${file.path}-${index}`}>
                            <div className={`split-cell ${row.oldKind}`}>
                              <span>{row.oldNo}</span>
                              <code>{row.oldText || ' '}</code>
                            </div>
                            <div className={`split-cell ${row.newKind}`}>
                              <span>{row.newNo}</span>
                              <code>{row.newText || ' '}</code>
                            </div>
                          </div>
                        ))}
                        {file.diff.length > 40 && <div className="multi-diff-more">… 仅预览前 40 行</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {selected ? (
            <>
              <div className="diff-header">
                <FileCode2 size={14} />
                <span>{selected.path}</span>
                <div className="file-actions">
                  <button type="button" className="file-action accept" aria-label="复制此文件 patch" onClick={() => void copySelectedPatch()}>
                    复制 patch
                  </button>
                  <button type="button" className="file-action accept" aria-label="导出此文件 patch" onClick={exportSelectedPatch}>
                    导出 patch
                  </button>
                  <button type="button" className="file-action accept" aria-label="接受此文件改动" disabled={selectedAccepted} onClick={() => void acceptSelectedFile()}>
                    接受
                  </button>
                  <button type="button" className="file-action reject" aria-label="拒绝此文件改动" disabled={selectedRejected} onClick={() => void rejectSelectedFile()}>
                    拒绝
                  </button>
                </div>
                <div className="file-menu-wrap">
                  <button aria-label="文件选项" type="button" onClick={() => setFileMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>
                  {fileMenuOpen && (
                    <div className="task-menu file-menu" role="menu" aria-label="文件选项菜单">
                      <button type="button" role="menuitem" onClick={() => void copySelectedPath()}>复制路径</button>
                      <button type="button" role="menuitem" onClick={() => void copySelectedPatch()}>复制此文件 patch</button>
                      <button type="button" role="menuitem" onClick={() => void copyAllPatches()} disabled={files.length === 0}>
                        复制全部 patch
                      </button>
                      <button type="button" role="menuitem" onClick={exportSelectedPatch}>导出此文件 patch</button>
                      <button type="button" role="menuitem" onClick={exportAllPatches} disabled={files.length === 0}>
                        导出全部 patch
                      </button>
                      <button type="button" role="menuitem" onClick={() => void acceptSelectedFile()}>接受此文件</button>
                      <button type="button" role="menuitem" onClick={() => void rejectSelectedFile()}>拒绝并还原此文件</button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onRequestRevert([selected.path])
                          setReviewState('revert-help')
                          setFileMenuOpen(false)
                        }}
                      >
                        让 Grok 撤销此文件
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {hunks.length > 0 && (
                <div className="hunk-list" role="tablist" aria-label="改动片段">
                  {hunks.map((hunk) => (
                    <button
                      key={hunk.id}
                      type="button"
                      role="tab"
                      aria-selected={!showAllHunks && activeHunk?.id === hunk.id}
                      className={`hunk-chip ${!showAllHunks && activeHunk?.id === hunk.id ? 'active' : ''} ${hunkDecisions[hunk.id] ?? ''}`}
                      onClick={() => {
                        setShowAllHunks(false)
                        setActiveHunkId(hunk.id)
                      }}
                    >
                      {hunk.id}
                      <em>+{hunk.additions}/−{hunk.deletions}</em>
                      {hunkDecisions[hunk.id] === 'accept' && <span>接受</span>}
                      {hunkDecisions[hunk.id] === 'reject' && <span>拒绝</span>}
                    </button>
                  ))}
                </div>
              )}
              {(activeHunk || showAllHunks) && (
                <div className="hunk-toolbar">
                  <strong>{showAllHunks ? `全部片段 · ${hunks.length} 个` : activeHunk?.title}</strong>
                  <div className="file-actions">
                    {activeHunk && !showAllHunks && (
                      <>
                        <button type="button" className="file-action accept" aria-label={`接受片段 ${activeHunk.id}`} onClick={() => acceptHunk(activeHunk)}>接受片段</button>
                        <button type="button" className="file-action reject" aria-label={`拒绝片段 ${activeHunk.id}`} onClick={() => void rejectHunk(activeHunk)}>拒绝片段</button>
                      </>
                    )}
                    {hunks.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="file-action accept"
                          aria-label="全部接受片段"
                          onClick={acceptAllHunks}
                        >
                          全部接受
                        </button>
                        <button
                          type="button"
                          className="file-action reject"
                          aria-label="全部拒绝片段"
                          onClick={() => void rejectAllHunks()}
                        >
                          全部拒绝
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`file-action accept ${previewDecisions ? 'active' : ''}`}
                      aria-label="预览片段决策"
                      aria-pressed={previewDecisions}
                      onClick={() => setPreviewDecisions((open) => !open)}
                    >
                      {previewDecisions ? '关闭预览' : '预览决策'}
                    </button>
                    <button
                      type="button"
                      className="file-action accept"
                      aria-label="批量应用片段决策"
                      onClick={() => void applyAllHunkDecisions()}
                    >
                      应用全部决策
                    </button>
                  </div>
                </div>
              )}
              {previewDecisions && (
                <pre className="hunk-preview" aria-label="片段决策预览">{decisionPreviewText}</pre>
              )}
              {actionError && <div className="connection-error review-action-error" role="alert">{actionError}</div>}
              {diffLayout === 'split' ? (
                <div
                  ref={diffScrollRef}
                  className={`split-diff ${previewDecisions ? 'previewing' : ''}${virtualizeDiff ? ' is-virtualized' : ''}`}
                  aria-label="并排 diff"
                  onScroll={virtualizeDiff ? onDiffScroll : undefined}
                >
                  <div className="split-head">
                    <span>旧版本</span>
                    <span>新版本</span>
                  </div>
                  {virtualizeDiff ? (
                    <div className="diff-virtual-spacer" style={{ height: diffWindow.totalHeight }}>
                      <div className="diff-virtual-window" style={{ transform: `translateY(${diffWindow.offsetTop}px)` }}>
                        {visibleDiffBlocks.map((block, offset) => renderDiffBlock(block, diffWindow.start + offset))}
                      </div>
                    </div>
                  ) : (
                    diffBlocks.map((block, index) => renderDiffBlock(block, index))
                  )}
                </div>
              ) : (
                <div
                  ref={diffScrollRef}
                  className={`diff-view ${previewDecisions ? 'previewing' : ''}${virtualizeDiff ? ' is-virtualized' : ''}`}
                  aria-label="统一 diff"
                  onScroll={virtualizeDiff ? onDiffScroll : undefined}
                >
                  {virtualizeDiff ? (
                    <div className="diff-virtual-spacer" style={{ height: diffWindow.totalHeight }}>
                      <div className="diff-virtual-window" style={{ transform: `translateY(${diffWindow.offsetTop}px)` }}>
                        {visibleDiffBlocks.map((block, offset) => renderDiffBlock(block, diffWindow.start + offset))}
                      </div>
                    </div>
                  ) : (
                    diffBlocks.map((block, index) => renderDiffBlock(block, index))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty-review" aria-label="空审阅状态">
              <div className="empty-review-icon" aria-hidden="true">
                <FileDiff size={22} />
              </div>
              <strong>
                {workspace
                  ? workspace.gitAvailable
                    ? '暂无 Git 变更'
                    : '无法读取 Git 变更'
                  : '尚未连接'}
              </strong>
              <span>
                {workspace
                  ? workspace.gitAvailable
                    ? '当前工作区没有未提交的修改。Grok 改动文件后会自动出现在这里。'
                    : '运行时缺少 x.ai/git/*，且本地 git 回退不可用。请确认工作区是 Git 仓库并已安装 git。'
                  : '连接 Grok 后将在这里显示实时 Git 变更。'}
              </span>
              {workspace && (
                <button
                  type="button"
                  className="empty-review-action"
                  aria-label="刷新变更"
                  onClick={() => onRefreshWorkspace?.()}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  刷新变更
                </button>
              )}
            </div>
          )}
          <div className={`review-footer ${hasChanges ? '' : 'is-empty'}`.trim()}>
            <div className={`review-state ${reviewState === 'confirmed' ? 'applied' : ''}`} role={reviewState === 'revert-help' || reviewState === 'confirmed' ? 'status' : undefined}>
              {reviewState === 'confirmed' ? <Check size={14} /> : <ShieldCheck size={14} />}
              {reviewState === 'confirmed'
                ? '已确认并暂存'
                : reviewState === 'revert-help'
                  ? (connected ? '已处理撤销（本地优先，失败则请 Grok）' : '已尝试本地还原')
                  : hasChanges
                    ? '等待你的审阅'
                    : '无待审改动'}
            </div>
            <div className="review-footer-actions">
              <button
                className="reject-button"
                disabled={!hasChanges || reviewState === 'confirmed'}
                onClick={() => void requestRevertAll()}
                type="button"
                aria-label="请求撤销"
                title="优先本地 git 还原全部文件；失败时再请 Grok 处理"
              >
                <X size={14} /> 请求撤销
              </button>
              <button
                className="apply-button"
                disabled={!hasChanges || reviewState === 'confirmed'}
                onClick={() => void confirmReviewed()}
                type="button"
                aria-label="确认审阅"
                title="将已接受（或未拒绝）的文件 git add 暂存，不会自动 commit"
              >
                <Check size={14} /> 确认审阅
              </button>
              <button
                className="apply-button"
                disabled={!hasChanges && reviewState !== 'confirmed'}
                onClick={openCommitDialog}
                type="button"
                aria-label="提交 commit"
                title="暂存并创建 git commit"
              >
                <GitBranch size={14} /> 提交
              </button>
            </div>
          </div>
          {commitOpen && (
            <div className="commit-dialog-backdrop" role="presentation" onClick={() => !commitBusy && setCommitOpen(false)}>
              <div
                className="commit-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="创建提交"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !commitBusy) {
                    event.preventDefault()
                    event.stopPropagation()
                    setCommitOpen(false)
                    return
                  }
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !commitBusy && commitMessage.trim()) {
                    event.preventDefault()
                    void submitCommit()
                  }
                }}
              >
                <header>
                  <strong>创建提交</strong>
                  <button type="button" className="icon-button" aria-label="关闭提交对话框" disabled={commitBusy} onClick={() => setCommitOpen(false)}>
                    <X size={16} />
                  </button>
                </header>
                <p className="capability-hint">
                  仅暂存并提交本次审阅接受（或未拒绝）的文件；不会 push，也不会带上无关已暂存改动。
                </p>
                <label>
                  提交说明
                  <textarea
                    aria-label="提交说明"
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="简述本次改动…（Ctrl+Enter 提交）"
                    autoFocus
                    disabled={commitBusy}
                  />
                </label>
                {commitError && <div className="commit-dialog-error" role="alert">{commitError}</div>}
                <div className="commit-dialog-actions">
                  <button type="button" className="reject-button" disabled={commitBusy} onClick={() => setCommitOpen(false)}>取消</button>
                  <button
                    type="button"
                    className="apply-button"
                    aria-label="确认创建提交"
                    disabled={commitBusy || !commitMessage.trim()}
                    onClick={() => void submitCommit()}
                  >
                    {commitBusy ? '提交中…' : '确认提交'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="terminal-view">
          <div className="terminal-toolbar">
            <div className="terminal-tabs" role="tablist" aria-label="终端列表">
              {terminals.length === 0 ? (
                <span className="terminal-empty-label">暂无终端</span>
              ) : (
                terminals.map((item) => (
                  <button
                    key={`${item.source}-${item.terminalId}`}
                    type="button"
                    role="tab"
                    aria-selected={selectedTerminalKey === `${item.source}:${item.terminalId}`}
                    className={selectedTerminalKey === `${item.source}:${item.terminalId}` ? 'active' : ''}
                    onClick={() => setSelectedTerminalKey(`${item.source}:${item.terminalId}`)}
                  >
                    {item.source === 'local' ? '本地 · ' : ''}{item.name || item.terminalId}
                    {item.source === 'local' && item.interactive ? ' · 交互' : ''}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className="terminal-refresh"
              aria-label="新建本地 Shell"
              title="在当前工作区启动交互式 PowerShell / shell"
              onClick={() => void openLocalShell()}
            >
              新建
            </button>
            <button
              type="button"
              className="terminal-refresh"
              aria-label="刷新终端"
              onClick={() => {
                onRefreshWorkspace?.()
                void refreshLocalTerminals()
              }}
              disabled={!connected && localTerminals.length === 0}
            >
              刷新
            </button>
            {terminal?.source === 'local' && (
              <button
                type="button"
                className="terminal-refresh danger"
                aria-label="终止本地终端"
                onClick={() => void killLocalTerminal(terminal.terminalId)}
              >
                终止
              </button>
            )}
          </div>
          <div className="terminal-command">
            <span>PS</span> {terminal?.name ?? terminal?.terminalId ?? '暂无活跃终端'}
            {terminal?.status && <em>{terminal.status}</em>}
            {typeof terminal?.exitCode === 'number' && <em>exit {terminal.exitCode}</em>}
            {terminal?.source && <em>{terminal.source === 'local' ? (terminal.interactive ? '本地交互' : '客户端') : 'Grok'}</em>}
          </div>
          <div className="terminal-output" ref={terminalOutputRef} aria-label="终端输出">
            {terminal?.output
              || (localTerminals.length === 0 && !(workspace?.terminals?.length)
                ? '暂无终端输出。可点击「新建」启动本地交互 Shell，或等待 Grok Agent 创建 terminal/*。'
                : '选择上方终端标签以查看输出。')}
            {terminal?.truncated && <><br /><br /><b>输出已截断</b></>}
          </div>
          <form
            className="terminal-input-bar"
            onSubmit={(event) => {
              event.preventDefault()
              void sendTerminalLine()
            }}
          >
            <span className="terminal-input-prompt" aria-hidden="true">{canWriteTerminal ? '›' : '·'}</span>
            <input
              aria-label="终端输入"
              className="terminal-input"
              value={terminalInput}
              onChange={(event) => setTerminalInput(event.target.value)}
              placeholder={
                canWriteTerminal
                  ? '输入命令后 Enter 发送到本地终端…'
                  : terminal?.source === 'remote'
                    ? 'Grok 终端为监视模式，不可输入'
                    : '请先「新建」本地交互 Shell'
              }
              disabled={!canWriteTerminal || terminalSending}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="terminal-send"
              aria-label="发送到终端"
              disabled={!canWriteTerminal || terminalSending || !terminalInput.trim()}
            >
              发送
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
