import { memo, useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, Paperclip, X } from 'lucide-react'
import { readTextFile, type PermissionOption } from '../lib/desktopBridge'
import { copyText } from '../lib/clipboard'
import { MarkdownView } from '../lib/MarkdownView'
import { isCachedDataUrlPath } from '../lib/attachmentStore'
import { attachmentLabel, isDataImageAttachment, type ChatMessage } from '../lib/tasks'
import type { PendingPermission } from './types'

function AttachmentVisual({ file }: { file: string }) {
  const [resolved, setResolved] = useState(file)

  useEffect(() => {
    let cancelled = false
    if (isDataImageAttachment(file)) {
      setResolved(file)
      return
    }
    if (!isCachedDataUrlPath(file)) {
      setResolved(file)
      return
    }
    void readTextFile(file)
      .then((raw) => {
        if (!cancelled && raw.startsWith('data:')) setResolved(raw)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [file])

  if (isDataImageAttachment(resolved)) {
    return (
      <a
        className="message-image-link"
        href={resolved}
        target="_blank"
        rel="noreferrer noopener"
        title="在新标签页打开图片"
      >
        <img src={resolved} alt={attachmentLabel(file)} className="message-image" />
      </a>
    )
  }

  return (
    <span className="message-file-chip" title={file}>
      <Paperclip size={12} />
      {attachmentLabel(file)}
    </span>
  )
}
function MessageAttachments({ attachments }: { attachments?: string[] }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="message-attachments" aria-label="消息附件">
      {attachments.map((file, index) => (
        <AttachmentVisual key={`${file.slice(0, 48)}-${index}`} file={file} />
      ))}
    </div>
  )
}

function MessageCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])
  if (!text.trim()) return null
  return (
    <div className="message-copy-bar">
      <button
        type="button"
        className="message-copy-btn"
        aria-label={copied ? `${label}已复制` : label}
        title={copied ? '已复制' : label}
        onClick={() => {
          void (async () => {
            const ok = await copyText(text)
            if (!ok) return
            setCopied(true)
            if (timerRef.current != null) window.clearTimeout(timerRef.current)
            timerRef.current = window.setTimeout(() => setCopied(false), 1_600)
          })()
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

const MessageRow = memo(function MessageRow({
  message,
  index,
  highlighted,
}: {
  message: ChatMessage
  index: number
  highlighted: boolean
}) {
  if (message.role === 'user') {
    return (
      <div
        className={`user-message message-row${highlighted ? ' message-highlight' : ''}`}
        id={`chat-msg-${index}`}
        data-message-index={index}
      >
        {message.content.trim() ? (
          <MarkdownView source={message.content} className="md-user" />
        ) : null}
        <MessageAttachments attachments={message.attachments} />
        <MessageCopyButton text={message.content} label="复制消息" />
      </div>
    )
  }
  return (
    <div
      className={`agent-block history-message message-row ${message.role}${highlighted ? ' message-highlight' : ''}`}
      id={`chat-msg-${index}`}
      data-message-index={index}
      aria-label={message.role === 'system' ? '系统消息' : 'Grok 回复'}
    >
      <div className="agent-avatar"><Bot size={17} /></div>
      <div className="agent-content">
        <div className="agent-name">{message.role === 'system' ? '系统' : 'Grok'} <span>{message.role === 'system' ? '命令' : '回复'}</span></div>
        <MarkdownView
          source={message.content}
          className={message.role === 'system' ? 'md-system live-message' : 'md-agent live-message'}
        />
        <MessageAttachments attachments={message.attachments} />
        <MessageCopyButton text={message.content} label="复制消息" />
      </div>
    </div>
  )
})

export function MessageList({
  messages,
  highlightIndex = null,
  onHighlightConsumed,
}: {
  messages: ChatMessage[]
  highlightIndex?: number | null
  onHighlightConsumed?: () => void
}) {
  useEffect(() => {
    if (highlightIndex == null || highlightIndex < 0 || highlightIndex >= messages.length) return
    const el = document.getElementById(`chat-msg-${highlightIndex}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = window.setTimeout(() => onHighlightConsumed?.(), 2_400)
    return () => window.clearTimeout(timer)
  }, [highlightIndex, messages.length, onHighlightConsumed])

  return (
    <div className="message-list" data-count={messages.length}>
      {messages.map((message, index) => (
        <MessageRow
          key={`${message.role}-${index}-${message.content.length}`}
          message={message}
          index={index}
          highlighted={highlightIndex === index}
        />
      ))}
    </div>
  )
}

export function PermissionBanner({
  permission,
  queueLength = 1,
  onSelect,
}: {
  permission: PendingPermission
  /** Total pending permission requests including the one shown. */
  queueLength?: number
  onSelect: (option: PermissionOption) => void
}) {
  return (
    <div className="permission-card" role="alertdialog" aria-label="权限审批">
      <div>
        <strong>需要你的审批{queueLength > 1 ? `（${queueLength}）` : ''}</strong>
        <p>{permission.title}</p>
        {permission.toolCallId && <small>工具 ID：{permission.toolCallId}</small>}
        {queueLength > 1 && <small>处理完后还有 {queueLength - 1} 个待审批</small>}
      </div>
      <div className="permission-actions">
        {permission.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={option.kind.startsWith('reject') ? 'reject-button' : 'apply-button'}
            onClick={() => onSelect(option)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  )
}
