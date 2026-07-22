import { useMemo } from 'react'
import { highlightCodeLine, type HighlightToken } from '../lib/review'

export function HighlightedCode({ text, language }: { text: string; language: string }) {
  const tokens = useMemo(() => highlightCodeLine(text, language), [text, language])
  return (
    <code>
      {tokens.map((token: HighlightToken, index) => (
        <span key={`${token.kind}-${index}`} className={`tok-${token.kind}`}>{token.text}</span>
      ))}
    </code>
  )
}
