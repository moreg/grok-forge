import { useMemo, type ReactNode } from 'react'
import { highlightCodeLine, type HighlightToken } from './review'
import {
  parseMarkdown,
  type MdBlock,
  type MdInline,
} from './markdown'

function InlineCode({ text }: { text: string }) {
  return <code className="md-inline-code">{text}</code>
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
      case 'br':
        return <br key={key} />
      default:
        return null
    }
  })
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const lines = code.length === 0 ? [''] : code.split('\n')
  return (
    <pre className="md-code-block" data-language={language || 'text'}>
      <div className="md-code-lang" aria-hidden="true">{language && language !== 'text' ? language : 'code'}</div>
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
        return (
          <ListTag className={`md-list ${block.ordered ? 'ordered' : 'bullet'}`} key={key}>
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-i${itemIndex}`}>{renderInline(item, `${key}-i${itemIndex}`)}</li>
            ))}
          </ListTag>
        )
      }
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
