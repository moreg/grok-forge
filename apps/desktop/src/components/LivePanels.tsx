import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronRight, Code2, Sparkles } from 'lucide-react'
import type { AcpUiEvent } from '../lib/desktopBridge'
import { StreamPlainView } from '../lib/MarkdownView'
import {
  isToolDoneStatus,
  isToolFailedStatus,
  isToolRunningStatus,
  thoughtPreview,
} from './chatHelpers'

type LiveToolEvent = Extract<AcpUiEvent, { kind: 'tool' }>

export function LiveThoughtPanel({ text, hasReply }: { text: string; hasReply: boolean }) {
  const [open, setOpen] = useState(false)
  const manualRef = useRef(false)
  const wasEmptyRef = useRef(true)

  useEffect(() => {
    if (!text.trim()) {
      wasEmptyRef.current = true
      manualRef.current = false
      setOpen(false)
      return
    }
    // New thought stream always starts collapsed (preview only).
    if (wasEmptyRef.current) {
      wasEmptyRef.current = false
      manualRef.current = false
      setOpen(false)
    }
  }, [text])

  useEffect(() => {
    // If the user expanded thoughts mid-stream, fold again once the reply arrives
    // unless they re-toggled after the reply started.
    if (hasReply && !manualRef.current) setOpen(false)
  }, [hasReply])

  const toggle = () => {
    manualRef.current = true
    setOpen((value) => !value)
  }

  return (
    <div className={`live-thought ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Grok 思考中">
      <button
        type="button"
        className="live-thought-toggle"
        aria-expanded={open}
        aria-label={open ? '折叠思考过程' : '展开思考过程'}
        onClick={toggle}
      >
        <Sparkles size={13} />
        <span className="live-thought-label">思考过程</span>
        {!open && (
          <em className="live-thought-preview">{thoughtPreview(text)}</em>
        )}
        {open ? <ChevronDown size={13} className="live-thought-chevron" /> : <ChevronRight size={13} className="live-thought-chevron" />}
      </button>
      {open && (
        <div className="live-thought-body">
          <StreamPlainView source={text} className="live-thought-text" showCursor={!hasReply} />
        </div>
      )}
    </div>
  )
}
/**
 * Collapsible tool-call list for the live stream.
 * Long tool chains used to flood the chat; default is a one-line summary
 * (latest tool while running, counts when finished). User expands for detail.
 */
export function LiveToolEventsPanel({ tools, hasReply }: { tools: LiveToolEvent[]; hasReply: boolean }) {
  const [open, setOpen] = useState(false)
  const manualRef = useRef(false)
  const hadToolsRef = useRef(false)

  const doneCount = tools.filter((tool) => tool.status === 'completed' || tool.status === 'done').length
  const failedCount = tools.filter((tool) => isToolFailedStatus(tool.status)).length
  const running = tools.some((tool) => isToolRunningStatus(tool.status))
  const finished = tools.length > 0 && tools.every((tool) => isToolDoneStatus(tool.status))

  useEffect(() => {
    if (tools.length === 0) {
      hadToolsRef.current = false
      manualRef.current = false
      setOpen(false)
      return
    }
    // First tool in a run starts collapsed so the list never floods the chat.
    if (!hadToolsRef.current) {
      hadToolsRef.current = true
      manualRef.current = false
      setOpen(false)
    }
  }, [tools.length])

  useEffect(() => {
    // Auto-fold once the assistant reply starts or every tool has finished,
    // unless the user explicitly toggled this panel.
    if ((hasReply || finished) && !manualRef.current) setOpen(false)
  }, [hasReply, finished])

  if (tools.length === 0) return null

  const last = tools[tools.length - 1]
  const preview = running
    ? (last?.detail ? `${last.title} · ${last.detail}` : (last?.title || '执行中…'))
    : failedCount > 0
      ? `${doneCount}/${tools.length} 完成 · ${failedCount} 失败`
      : `${doneCount}/${tools.length} 完成`

  const toggle = () => {
    manualRef.current = true
    setOpen((value) => !value)
  }

  return (
    <div className={`live-tools ${open ? 'is-open' : 'is-collapsed'}`} aria-label="工具调用" role="region">
      <button
        type="button"
        className="live-tools-toggle"
        aria-expanded={open}
        aria-label={open ? '折叠工具调用' : '展开工具调用'}
        onClick={toggle}
      >
        <Code2 size={13} />
        <span className="live-tools-label">工具调用</span>
        {!open && <em className="live-tools-preview">{thoughtPreview(preview, 64)}</em>}
        <span className="live-tools-count">{tools.length}</span>
        {open
          ? <ChevronDown size={13} className="live-tools-chevron" />
          : <ChevronRight size={13} className="live-tools-chevron" />}
      </button>
      {open && (
        <div className="live-tools-body">
          {tools.map((event, index) => (
            <div
              className={`live-event tool ${isToolFailedStatus(event.status) ? 'is-failed' : isToolDoneStatus(event.status) ? 'is-done' : isToolRunningStatus(event.status) ? 'is-running' : ''}`}
              key={event.toolCallId ? `tool-${event.toolCallId}` : `tool-${index}-${event.title}`}
            >
              <Code2 size={13} />
              <span>{event.title}</span>
              {event.detail && <small className="event-detail">{event.detail}</small>}
              <em>{event.status}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
