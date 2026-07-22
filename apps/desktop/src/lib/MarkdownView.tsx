import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { highlightCodeLine, type HighlightToken } from './review'
import { copyText } from './clipboard'
import {
  parseMarkdown,
  type MdBlock,
  type MdInline,
} from './markdown'

function useCopiedFlag(resetMs: number) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])
  const markCopied = () => {
    setCopied(true)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), resetMs)
  }
  return { copied, markCopied }
}

function InlineCode({ text }: { text: string }) {
  return <code className="md-inline-code">{text}</code>
}

function PathRef({ path, line }: { path: string; line?: number }) {
  const { copied, markCopied } = useCopiedFlag(1_400)
  const label = line != null ? `${path}:${line}` : path
  return (
    <button
      type="button"
      className="md-path"
      title="点击复制路径"
      aria-label={`复制路径 ${label}`}
      onClick={() => {
        void (async () => {
          const ok = await copyText(label)
          if (ok) markCopied()
        })()
      }}
    >
      {label}
      {copied ? <span className="md-path-copied">已复制</span> : null}
    </button>
  )
}

function renderInline(nodes: MdInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    switch (node.type) {
      case 'text':
        return <span key={key}>{node.text}</span>
      case 'code':
        return <InlineCode key={key} text={node.text} />
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>
      case 'link':
        return (
          <a
            key={key}
            className="md-link"
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {renderInline(node.children, key)}
          </a>
        )
      case 'path':
        return <PathRef key={key} path={node.path} line={node.line} />
      case 'br':
        return <br key={key} />
      default:
        return null
    }
  })
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const { copied, markCopied } = useCopiedFlag(1_600)
  const lines = code.length === 0 ? [''] : code.split('\n')
  const langLabel = language && language !== 'text' ? language : 'code'

  const onCopy = () => {
    void (async () => {
      const ok = await copyText(code)
      if (ok) markCopied()
    })()
  }

  return (
    <pre className="md-code-block" data-language={language || 'text'}>
      <div className="md-code-toolbar">
        <span className="md-code-lang" aria-hidden="true">{langLabel}</span>
        <button
          type="button"
          className="md-code-copy"
          aria-label={copied ? '已复制代码' : '复制代码'}
          title={copied ? '已复制' : '复制代码'}
          onClick={onCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <code>
        {lines.map((line, index) => {
          const tokens = highlightCodeLine(line, language)
          return (
            <span className="md-code-line" key={`L${index}`}>
              {tokens.map((token: HighlightToken, tokenIndex) => (
                <span key={`${token.kind}-${tokenIndex}`} className={`tok-${token.kind}`}>{token.text}</span>
              ))}
              {index < lines.length - 1 ? '\n' : null}
            </span>
          )
        })}
      </code>
    </pre>
  )
}

function renderBlocks(blocks: MdBlock[], keyPrefix = 'b'): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`
    switch (block.type) {
      case 'paragraph':
        return (
          <p className="md-p" key={key}>
            {renderInline(block.children, key)}
          </p>
        )
      case 'heading': {
        const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4')
        return (
          <Tag className={`md-h md-h${block.level}`} key={key}>
            {renderInline(block.children, key)}
          </Tag>
        )
      }
      case 'code':
        return <CodeBlock key={key} language={block.language} code={block.code} />
      case 'list': {
        const ListTag = block.ordered ? 'ol' : 'ul'
        const isTask = block.items.some((item) => item.checked !== undefined && item.checked !== null)
        return (
          <ListTag
            className={`md-list ${block.ordered ? 'ordered' : 'bullet'}${isTask ? ' task-list' : ''}`}
            key={key}
          >
            {block.items.map((item, itemIndex) => (
              <li
                key={`${key}-i${itemIndex}`}
                className={item.checked === true ? 'task-done' : item.checked === false ? 'task-todo' : undefined}
                data-checked={item.checked === true ? 'true' : item.checked === false ? 'false' : undefined}
              >
                {item.checked !== undefined && item.checked !== null && (
                  <span className="md-task-box" aria-hidden="true">{item.checked ? '☑' : '☐'}</span>
                )}
                {renderInline(item.children, `${key}-i${itemIndex}`)}
              </li>
            ))}
          </ListTag>
        )
      }
      case 'table':
        return (
          <div className="md-table-wrap" key={key}>
            <table className="md-table">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th
                      key={`${key}-h${cellIndex}`}
                      style={block.aligns[cellIndex] ? { textAlign: block.aligns[cellIndex]! } : undefined}
                    >
                      {renderInline(cell, `${key}-h${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${key}-r${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${key}-r${rowIndex}-c${cellIndex}`}
                        style={block.aligns[cellIndex] ? { textAlign: block.aligns[cellIndex]! } : undefined}
                      >
                        {renderInline(cell, `${key}-r${rowIndex}-c${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'blockquote':
        return (
          <blockquote className="md-quote" key={key}>
            {renderBlocks(block.children, key)}
          </blockquote>
        )
      case 'hr':
        return <hr className="md-hr" key={key} />
      default:
        return null
    }
  })
}

export function MarkdownView({
  source,
  className = '',
  plainFallback = true,
}: {
  source: string
  className?: string
  /** When true, empty input renders nothing. */
  plainFallback?: boolean
}) {
  const blocks = useMemo(() => parseMarkdown(source), [source])

  if (!source.trim()) {
    return plainFallback ? null : <div className={`md-root ${className}`.trim()} />
  }

  return (
    <div className={`md-root ${className}`.trim()} data-markdown="true">
      {renderBlocks(blocks)}
    </div>
  )
}

/**
 * Lightweight live-stream renderer: no markdown parse / syntax highlight.
 * Use while tokens are still arriving; switch to MarkdownView after finalize.
 */
export function StreamPlainView({
  source,
  className = '',
  showCursor = false,
}: {
  source: string
  className?: string
  /** Trailing caret while the agent is still generating. */
  showCursor?: boolean
}) {
  if (!source) return null
  return (
    <div className={`stream-plain ${className}`.trim()} data-stream-plain="true">
      {source}
      {showCursor ? <span className="stream-cursor" aria-hidden="true" /> : null}
    </div>
  )
}
