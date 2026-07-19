/** Lightweight Markdown AST for chat messages (no external deps). */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'link'; href: string; children: MdInline[] }
  | { type: 'br' }

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; children: MdInline[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: MdInline[][] }
  | { type: 'blockquote'; children: MdBlock[] }
  | { type: 'hr' }

const LANG_ALIASES: Record<string, string> = {
  typescript: 'ts',
  tsx: 'ts',
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  rust: 'rs',
  python: 'py',
  py3: 'py',
  shell: 'cfg',
  bash: 'cfg',
  sh: 'cfg',
  zsh: 'cfg',
  powershell: 'cfg',
  ps1: 'cfg',
  yaml: 'cfg',
  yml: 'cfg',
  toml: 'cfg',
  jsonc: 'json',
  markdown: 'md',
  text: 'text',
  plain: 'text',
}

export function normalizeMarkdownLanguage(raw: string): string {
  const key = raw.trim().toLowerCase().split(/[\s,{]/)[0] ?? ''
  if (!key) return 'text'
  return LANG_ALIASES[key] ?? key
}

/** Allow http(s), anchors, and relative paths; reject javascript:/data: etc. */
export function safeMarkdownHref(href: string): string | null {
  const value = href.trim()
  if (!value) return null
  if (/^\s*javascript:/i.test(value) || /^\s*data:/i.test(value) || /^\s*vbscript:/i.test(value)) {
    return null
  }
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return value
  }
  // Plain relative paths like `docs/readme.md` without a scheme.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
  return null
}

function isBlockStart(line: string): boolean {
  if (/^```/.test(line)) return true
  if (/^#{1,4}\s+\S/.test(line)) return true
  if (/^\s*([-*+]|\d+\.)\s+\S/.test(line)) return true
  if (/^>\s?/.test(line)) return true
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) return true
  return false
}

/**
 * Parse a subset of CommonMark-ish Markdown into blocks.
 * Supports: fenced code, headings, lists, blockquotes, hr, paragraphs,
 * and inline bold/italic/code/links/hard breaks.
 */
export function parseMarkdown(source: string): MdBlock[] {
  const text = source.replace(/\r\n/g, '\n')
  if (!text.trim()) return []

  const lines = text.split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {
      const language = normalizeMarkdownLanguage(line.slice(3))
      i += 1
      const body: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'code', language, code: body.join('\n') })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const heading = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
    if (heading) {
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4
      blocks.push({ type: 'heading', level, children: parseInline(heading[2]) })
      i += 1
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+\S/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: MdInline[][] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')
        items.push(parseInline(itemText))
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      const nested = parseMarkdown(quote.join('\n'))
      blocks.push({
        type: 'blockquote',
        children: nested.length > 0 ? nested : [{ type: 'paragraph', children: parseInline(quote.join(' ')) }],
      })
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paraLines.push(lines[i])
      i += 1
    }
    // Two trailing spaces → hard break between lines; otherwise join with space.
    const joined = paraLines
      .map((row, index) => {
        if (index === paraLines.length - 1) return row.replace(/\s+$/, '')
        if (/ {2}$/.test(row)) return `${row.replace(/\s+$/, '')}\n`
        return `${row.trimEnd()} `
      })
      .join('')
      .replace(/ \n/g, '\n')
      .trimEnd()
    blocks.push({ type: 'paragraph', children: parseInline(joined) })
  }

  return blocks
}

/** Inline parser for emphasis, code spans, and links. */
export function parseInline(source: string): MdInline[] {
  const nodes: MdInline[] = []
  let i = 0

  const pushText = (text: string) => {
    if (!text) return
    const last = nodes[nodes.length - 1]
    if (last?.type === 'text') {
      last.text += text
      return
    }
    nodes.push({ type: 'text', text })
  }

  while (i < source.length) {
    if (source[i] === '\n') {
      nodes.push({ type: 'br' })
      i += 1
      continue
    }

    // escaped char
    if (source[i] === '\\' && i + 1 < source.length) {
      pushText(source[i + 1])
      i += 2
      continue
    }

    // inline code
    if (source[i] === '`') {
      let ticks = 1
      while (i + ticks < source.length && source[i + ticks] === '`') ticks += 1
      const close = source.indexOf('`'.repeat(ticks), i + ticks)
      if (close !== -1) {
        nodes.push({ type: 'code', text: source.slice(i + ticks, close) })
        i = close + ticks
        continue
      }
    }

    // links [label](url)
    if (source[i] === '[') {
      const closeLabel = source.indexOf(']', i + 1)
      if (closeLabel !== -1 && source[closeLabel + 1] === '(') {
        const closeUrl = source.indexOf(')', closeLabel + 2)
        if (closeUrl !== -1) {
          const label = source.slice(i + 1, closeLabel)
          const href = source.slice(closeLabel + 2, closeUrl)
          const safe = safeMarkdownHref(href)
          if (safe) {
            nodes.push({ type: 'link', href: safe, children: parseInline(label) })
            i = closeUrl + 1
            continue
          }
        }
      }
    }

    // strong ** or __
    if ((source.startsWith('**', i) || source.startsWith('__', i)) && i + 2 < source.length) {
      const marker = source.slice(i, i + 2)
      const close = source.indexOf(marker, i + 2)
      if (close !== -1) {
        nodes.push({ type: 'strong', children: parseInline(source.slice(i + 2, close)) })
        i = close + 2
        continue
      }
    }

    // emphasis * or _ (single)
    if ((source[i] === '*' || source[i] === '_') && source[i + 1] !== source[i]) {
      const marker = source[i]
      // avoid matching list-like mid-word underscores: require non-space after open
      if (i + 1 < source.length && source[i + 1] !== ' ') {
        const close = source.indexOf(marker, i + 1)
        if (close !== -1 && source[close - 1] !== ' ' && source[close - 1] !== '\n') {
          nodes.push({ type: 'em', children: parseInline(source.slice(i + 1, close)) })
          i = close + 1
          continue
        }
      }
    }

    // consume plain run until next special
    let j = i + 1
    while (j < source.length) {
      const ch = source[j]
      if (
        ch === '`'
        || ch === '['
        || ch === '*'
        || ch === '_'
        || ch === '\\'
        || ch === '\n'
        || (ch === '*' && source[j + 1] === '*')
      ) {
        break
      }
      j += 1
    }
    pushText(source.slice(i, j))
    i = j
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }]
}

/** True when content likely benefits from Markdown rendering (heuristic). */
export function looksLikeMarkdown(source: string): boolean {
  if (!source) return false
  if (/```/.test(source)) return true
  if (/^#{1,4}\s+\S/m.test(source)) return true
  if (/^\s*([-*+]|\d+\.)\s+\S/m.test(source)) return true
  if (/\*\*[^*]+\*\*/.test(source) || /`[^`]+`/.test(source)) return true
  if (/\[[^\]]+\]\([^)]+\)/.test(source)) return true
  if (/^>\s?\S/m.test(source)) return true
  return false
}
