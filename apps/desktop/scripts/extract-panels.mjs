/**
 * Extract major panels from App.tsx into src/components/*.
 * Run: node scripts/extract-panels.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const appPath = path.join(root, 'src/App.tsx')
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/)
const outDir = path.join(root, 'src/components')
fs.mkdirSync(outDir, { recursive: true })

function slice(start1, end1) {
  return lines.slice(start1 - 1, end1).join('\n')
}

function write(name, content) {
  const file = path.join(outDir, name)
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`)
  console.log('wrote', name, content.split('\n').length, 'lines')
}

// ---------- BrandMark ----------
write('BrandMark.tsx', `/** 品牌图标：G 形锻环 + 紫色锻锤 + 火花，与应用图标同源 */
export function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
      <path
        d="M724 262C666 208 590 176 506 176C318 176 168 326 168 512C168 698 318 848 506 848C646 848 766 766 820 652"
        stroke="currentColor"
        strokeWidth="108"
        strokeLinecap="round"
      />
      <path
        d="M512 496H848L726 618"
        stroke="#8B7DFF"
        strokeWidth="108"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M268 240l14 34 34 14-34 14-14 34-14-34-34-14 34-14z" fill="#8B7DFF" />
    </svg>
  )
}
`)

// ---------- HighlightedCode ----------
write('HighlightedCode.tsx', `import { useMemo } from 'react'
import { highlightCodeLine, type HighlightToken } from '../lib/review'

export function HighlightedCode({ text, language }: { text: string; language: string }) {
  const tokens = useMemo(() => highlightCodeLine(text, language), [text, language])
  return (
    <code>
      {tokens.map((token: HighlightToken, index) => (
        <span key={\`\${token.kind}-\${index}\`} className={\`tok-\${token.kind}\`}>{token.text}</span>
      ))}
    </code>
  )
}
`)

// Find current boundaries dynamically
function findLine(re, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1
  }
  throw new Error(`Not found: ${re}`)
}

const liveThoughtStart = findLine(/^function LiveThoughtPanel/)
const liveToolStart = findLine(/^function LiveToolEventsPanel/)
const sidebarStart = findLine(/^const WorkspaceSidebar = memo/)
const execStart = findLine(/^function ExecutionTimeline/)
const changeStart = findLine(/^function ChangeSummary/)
const msgAttachStart = findLine(/^function MessageAttachments/)
const msgListStart = findLine(/^function MessageList/)
const permStart = findLine(/^function PermissionBanner/)
const convStart = findLine(/^function ConversationPane/)
const reviewStart = findLine(/^function toReviewFile/)
const overlayStart = findLine(/^function Overlay/)
const appStart = findLine(/^export default function App/)

// Live panels (includes type LiveToolEvent above LiveToolEventsPanel)
const liveStart = liveThoughtStart
const liveEnd = sidebarStart - 1
let liveBody = slice(liveStart, liveEnd)
liveBody = liveBody
  .replace(/^function LiveThoughtPanel/, 'export function LiveThoughtPanel')
  .replace(/^function LiveToolEventsPanel/, 'export function LiveToolEventsPanel')
  .replace(/^type LiveToolEvent.+\n/, '')

write('LivePanels.tsx', `import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import type { AcpUiEvent } from '../lib/desktopBridge'
import { StreamPlainView } from '../lib/MarkdownView'
import {
  isToolDoneStatus,
  isToolFailedStatus,
  isToolRunningStatus,
  thoughtPreview,
} from './chatHelpers'

type LiveToolEvent = Extract<AcpUiEvent, { kind: 'tool' }>

${liveBody}
`)

// WorkspaceSidebar
const sidebarEnd = execStart - 1
let sidebarBody = slice(sidebarStart, sidebarEnd)
sidebarBody = sidebarBody.replace(
  /^const WorkspaceSidebar = memo/,
  'export const WorkspaceSidebar = memo',
)
write('WorkspaceSidebar.tsx', `import { type MouseEvent, memo, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import type { Task } from '../lib/tasks'
import {
  collectTaskTags,
  countArchivedTasks,
  listTasks,
  statusLabel,
} from '../lib/tasks'
import {
  formatBillingNextRefreshLabel,
  formatBillingRefreshLabel,
  formatPeriodEndAbsolute,
  formatPeriodRemainingLabel,
  formatUsageLabel,
  periodLabelFromType,
  profileInitials,
  type WorkspaceProfile,
} from '../lib/prefs'
import type { BillingUsage } from '../lib/grokAcpClient'
import { sidebarTasksEqual } from '../lib/sidebarCompare'
import { BILLING_POLL_INTERVAL_MS } from '../lib/grokAcpClient'

${sidebarBody}
`)

// ExecutionTimeline + ChangeSummary
const execEnd = changeStart - 1
let execBody = slice(execStart, execEnd).replace(/^function ExecutionTimeline/, 'export function ExecutionTimeline')
write('ExecutionTimeline.tsx', `import { useEffect, useRef, useState } from 'react'
import { Activity, Check, ChevronDown, ChevronRight, CircleDot, Code2 } from 'lucide-react'
import type { PlanStep } from '../lib/tasks'
import { formatStepDuration, formatStepsTotalDuration } from '../lib/tasks'

${execBody}
`)

const changeEnd = msgAttachStart - 1
let changeBody = slice(changeStart, changeEnd).replace(/^function ChangeSummary/, 'export function ChangeSummary')
write('ChangeSummary.tsx', `import { FileDiff } from 'lucide-react'
import type { WorkspaceData } from '../lib/grokAcpClient'

${changeBody}
`)

// MessageList block: MessageAttachments through PermissionBanner
const msgEnd = convStart - 1
let msgBody = slice(msgAttachStart, msgEnd)
msgBody = msgBody
  .replace(/^function MessageAttachments/, 'function MessageAttachments')
  .replace(/^function MessageCopyButton/, 'function MessageCopyButton')
  .replace(/^const MessageRow = memo/, 'const MessageRow = memo')
  .replace(/^function MessageList/, 'export function MessageList')
  .replace(/^function PermissionBanner/, 'export function PermissionBanner')

write('MessageList.tsx', `import { memo, useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, Paperclip, X } from 'lucide-react'
import type { PermissionOption } from '../lib/desktopBridge'
import { copyText } from '../lib/clipboard'
import { MarkdownView } from '../lib/MarkdownView'
import { attachmentLabel, isDataImageAttachment, type ChatMessage } from '../lib/tasks'
import type { PendingPermission } from './types'

${msgBody}
`)

// ConversationPane
const convEnd = reviewStart - 1
let convBody = slice(convStart, convEnd).replace(/^function ConversationPane/, 'export function ConversationPane')
write('ConversationPane.tsx', `import { type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  MoreHorizontal,
  PanelRightOpen,
  Paperclip,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import {
  getBackendStatus,
  selectFiles,
  type AcpUiEvent,
  type BackendStatus,
  type PermissionOption,
} from '../lib/desktopBridge'
import {
  type ApprovalMode,
  type Task,
  attachmentLabel,
  buildAttachmentPrompt,
  helpMessage,
  isDataImageAttachment,
  matchInlineSlashCommands,
  modelLabel,
  pickAllowOption,
  readAttachmentsFromDataTransfer,
  readImageAttachmentsFromDataTransfer,
  reconnectDelayMs,
  reconnectToastMessage,
  statusLabel,
  titleFromPrompt,
  toggleTaskTag,
  toResourceBlocks,
} from '../lib/tasks'
import {
  eventMatchesShortcut,
  showDesktopNotification,
  type ShortcutMap,
} from '../lib/prefs'
import { loadMcpServers } from '../lib/mcp'
import {
  BILLING_POLL_INTERVAL_MS,
  GrokAcpClient,
  type BillingUsage,
  type WorkspaceData,
} from '../lib/grokAcpClient'
import { StreamPlainView } from '../lib/MarkdownView'
import { createStreamBatcher } from '../lib/streamBatch'
import { createWorkspaceRefreshController } from '../lib/workspaceRefresh'
import { asEvents } from './chatHelpers'
import type { PendingPermission, TaskPatch } from './types'
import { LiveThoughtPanel, LiveToolEventsPanel } from './LivePanels'
import { MessageList, PermissionBanner } from './MessageList'
import { ExecutionTimeline } from './ExecutionTimeline'
import { ChangeSummary } from './ChangeSummary'

${convBody}
`)

// ReviewPane (includes toReviewFile)
const reviewEnd = overlayStart - 1
let reviewBody = slice(reviewStart, reviewEnd)
reviewBody = reviewBody
  .replace(/^function toReviewFile/, 'function toReviewFile')
  .replace(/^function ReviewPane/, 'export function ReviewPane')

write('ReviewPane.tsx', `import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  FileCode2,
  FileDiff,
  PanelRightClose,
  Plus,
  RefreshCw,
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

${reviewBody}
`)

// Overlay
const overlayEnd = appStart - 1
let overlayBody = slice(overlayStart, overlayEnd).replace(/^function Overlay/, 'export function Overlay')
write('Overlay.tsx', `import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { BackendStatus } from '../lib/desktopBridge'
import { copyText } from '../lib/clipboard'
import { MarkdownView } from '../lib/MarkdownView'
import {
  type ApprovalMode,
  type FontScale,
  type Task,
  type ThemeMode,
  MODEL_OPTIONS,
  SLASH_COMMANDS,
  downloadTextFile,
  exportSearchHitsFilename,
  exportSearchHitsMarkdown,
  exportSessionReplaysFilename,
  exportSessionReplaysMarkdown,
  exportTaskStatsFilename,
  exportTaskStatsMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  filterCommandPaletteTasks,
  filterSessionTasks,
  filterSlashCommands,
  fontScaleLabel,
  filterTasksByStatsRange,
  formatTaskStatsSummary,
  searchTasksGlobal,
  statusLabel,
  STATS_TIME_RANGE_OPTIONS,
  summarizeTaskStats,
  type GlobalSearchHit,
  type ImportTasksMode,
  type StatsTimeRange,
} from '../lib/tasks'
import {
  type ExportHistoryEntry,
  type ShortcutId,
  type ShortcutMap,
  type WorkspaceProfile,
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  exportHistoryCanRedownload,
  exportHistoryKindLabel,
  formatExportHistoryTime,
  profileInitials,
} from '../lib/prefs'
import {
  type McpServerConfig,
  MCP_TEMPLATES,
  applyMcpTemplate,
  createEmptyMcpServer,
  formatArgsInput,
  formatEnvInput,
  parseArgsInput,
  parseEnvInput,
} from '../lib/mcp'
import type { WorkspaceData } from '../lib/grokAcpClient'
import type { OverlayPanel } from './types'
import { BrandMark } from './BrandMark'

${overlayBody}
`)

// Slim App.tsx — keep only App()
const appBody = slice(appStart, lines.length)
const slimApp = `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getBackendStatus,
  selectWorkspace,
  type BackendStatus,
} from './lib/desktopBridge'
import {
  type ApprovalMode,
  type FontScale,
  type Task,
  type ThemeMode,
  applyAppearance,
  archiveAssistantReply,
  createTask,
  downloadTextFile,
  exportAllTasksFilename,
  exportAllTasksJson,
  exportAllTasksMarkdown,
  exportTaskReplay,
  exportTaskReplayFilename,
  importTasksSnapshot,
  listTasks,
  loadApprovalMode,
  loadAutoReconnect,
  loadFontScale,
  loadPreferredModel,
  loadTaskSnapshot,
  loadTheme,
  loadWorkspaces,
  mergePlanIntoSteps,
  mergeToolIntoPlan,
  parseTaskExportPayload,
  rememberWorkspace,
  saveApprovalMode,
  saveAutoReconnect,
  saveFontScale,
  savePreferredModel,
  saveTaskSnapshot,
  saveTheme,
  toggleTaskArchived,
  toggleTaskPinned,
  type GlobalSearchHit,
  type ImportTasksMode,
} from './lib/tasks'
import {
  type ExportHistoryEntry,
  type ExportHistoryKind,
  type ShortcutId,
  type ShortcutMap,
  type WorkspaceProfile,
  bindingFromEvent,
  clampReviewWidth,
  clampSidebarWidth,
  clearExportHistory,
  eventMatchesShortcut,
  exportHistoryCanRedownload,
  exportHistoryMime,
  layoutGridTemplate,
  loadDesktopNotifications,
  loadExportHistory,
  loadLayoutWidths,
  loadShortcuts,
  loadWorkspaceProfile,
  pushExportHistory,
  resetShortcuts,
  saveDesktopNotifications,
  saveLayoutWidths,
  saveShortcuts,
  saveWorkspaceProfile,
} from './lib/prefs'
import {
  type McpServerConfig,
  loadMcpServers,
  saveMcpServers,
} from './lib/mcp'
import {
  type BillingUsage,
  type WorkspaceData,
} from './lib/grokAcpClient'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { ResizeHandle } from './components/ResizeHandle'
import { ConversationPane } from './components/ConversationPane'
import { ReviewPane } from './components/ReviewPane'
import { Overlay } from './components/Overlay'
import type { OverlayPanel, TaskPatch } from './components/types'
import { mergeLiveEvent } from './components/chatHelpers'

${appBody}
`

fs.writeFileSync(appPath, slimApp.endsWith('\n') ? slimApp : `${slimApp}\n`)
console.log('rewrote App.tsx', slimApp.split('\n').length, 'lines')
console.log('done')
