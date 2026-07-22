/** Lightweight Markdown AST for chat messages (no external deps). */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'link'; href: string; children: MdInline[] }
  | { type: 'path'; path: string; line?: number }
  | { type: 'br' }

export type MdListItem = {
  children: MdInline[]
  /** true / false for task lists; undefined for plain bullets. */
  checked?: boolean | null
}

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4; children: MdInline[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; ordered: boolean; items: MdListItem[] }
  | { type: 'table'; header: MdInline[][]; rows: MdInline[][][]; aligns: Array<'left' | 'center' | 'right' | null> }
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

/**
 * Match repo-ish paths like `src/app.ts` or `./foo/bar.tsx:42`.
 * Requires at least one `/` and a file extension so plain words stay plain.
 */
const PATH_TOKEN_RE = /(?:\.\/|\.\.\/)?(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@-]+\.[A-Za-z0-9]{1,12}(?::\d{1,6})?(?::\d{1,6})?/g

/** First path segment looks like a hostname (example.com, localhost). */
function looksLikeHostnameSegment(segment: string): boolean {
  const host = segment.replace(/^\.+\//, '').split('/')[0] ?? ''
  if (!host) return false
  if (host === 'localhost' || host.startsWith('localhost:')) return true
  // host.tld or host.tld:port — avoid treating real package paths like `@scope/pkg` (no dot TLD alone)
  if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?$/.test(host)) return true
  return false
}

/**
 * Split plain text into text + path nodes so file references are clickable.
 * Skips URL host/path fragments (e.g. https://example.com/a/b.js).
 */
export function linkifyPathsInText(text: string): MdInline[] {
  if (!text) return []
  const nodes: MdInline[] = []
  let last = 0
  PATH_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PATH_TOKEN_RE.exec(text)) !== null) {
    const token = match[0]
    const start = match.index
    // Avoid matching inside emails / identifiers.
    if (start > 0) {
      const prev = text[start - 1]
      if (prev && /[A-Za-z0-9_@]/.test(prev)) continue
    }
    // Skip anything that continues an open URL (scheme… no whitespace yet),
    // including port tails like http://localhost:3000/src/main.ts → "3000/src/…".
    const before = text.slice(0, start)
    if (/[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(before)) continue
    // Host-like first segment without scheme still looks like a URL path.
    if (!token.startsWith('./') && !token.startsWith('../') && looksLikeHostnameSegment(token)) {
      continue
    }
    // Pure numeric first segment is almost never a repo path (port leftovers).
    const firstSeg = token.replace(/^\.+\//, '').split('/')[0] ?? ''
    if (/^\d+$/.test(firstSeg)) continue
    if (start > last) {
      nodes.push({ type: 'text', text: text.slice(last, start) })
    }
    const lineMatch = /^(.*):(\d{1,6})(?::\d{1,6})?$/.exec(token)
    if (lineMatch && lineMatch[1].includes('/')) {
      nodes.push({ type: 'path', path: lineMatch[1], line: Number(lineMatch[2]) })
    } else {
      nodes.push({ type: 'path', path: token })
    }
    last = start + token.length
  }
  if (last < text.length) {
    nodes.push({ type: 'text', text: text.slice(last) })
  }
  return nodes.length > 0 ? nodes : [{ type: 'text', text }]
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('-')) return false
  // |---|:---:|---| or ---|---
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed) || /^(\s*:?-+:?\s*\|)+\s*:?-+:?\s*$/.test(trimmed)
}

function splitTableRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|')) row = row.slice(0, -1)
  return row.split('|').map((cell) => cell.trim())
}

function parseAligns(separator: string): Array<'left' | 'center' | 'right' | null> {
  return splitTableRow(separator).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

function isTableStart(line: string, next?: string): boolean {
  if (!next || !isTableSeparator(next)) return false
  if (!line.includes('|')) return false
  return splitTableRow(line).length >= 1
}

function isBlockStart(line: string, next?: string): boolean {
  if (/^```/.test(line)) return true
  if (/^#{1,4}\s+\S/.test(line)) return true
  if (/^\s*([-*+]|\d+\.)\s+\S/.test(line)) return true
  if (/^>\s?/.test(line)) return true
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) return true
  if (isTableStart(line, next)) return true
  return false
}

/**
 * Parse a subset of CommonMark-ish Markdown into blocks.
 * Supports: fenced code, headings, lists (incl. task lists), tables, blockquotes, hr, paragraphs,
 * and inline bold/italic/code/links/hard breaks/path refs.
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

    if (isTableStart(line, lines[i + 1])) {
      const header = splitTableRow(line).map((cell) => parseInline(cell))
      const aligns = parseAligns(lines[i + 1])
      i += 2
      const rows: MdInline[][][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
        // stop if this looks like a new non-table construct
        if (/^```/.test(lines[i]) || /^#{1,4}\s/.test(lines[i]) || /^>\s?/.test(lines[i])) break
        if (/^\s*([-*+]|\d+\.)\s+\S/.test(lines[i])) break
        rows.push(splitTableRow(lines[i]).map((cell) => parseInline(cell)))
        i += 1
      }
      // Normalize column counts to header length
      const cols = header.length
      const normalizedAligns = Array.from({ length: cols }, (_, index) => aligns[index] ?? null)
      blocks.push({
        type: 'table',
        header,
        rows: rows.map((row) => Array.from({ length: cols }, (_, index) => row[index] ?? [{ type: 'text', text: '' }])),
        aligns: normalizedAligns,
      })
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: MdListItem[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')
        const task = /^\[([ xX])\]\s+(.*)$/.exec(itemText)
        if (task) {
          items.push({
            checked: task[1].toLowerCase() === 'x',
            children: parseInline(task[2]),
          })
        } else {
          items.push({ children: parseInline(itemText) })
        }
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
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
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

function pushTextWithPaths(nodes: MdInline[], text: string) {
  if (!text) return
  const parts = linkifyPathsInText(text)
  for (const part of parts) {
    if (part.type === 'text') {
      const last = nodes[nodes.length - 1]
      if (last?.type === 'text') {
        last.text += part.text
        continue
      }
    }
    nodes.push(part)
  }
}

/** Inline parser for emphasis, code spans, links, and path refs. */
export function parseInline(source: string): MdInline[] {
  const nodes: MdInline[] = []
  let i = 0

  const pushText = (text: string) => {
    pushTextWithPaths(nodes, text)
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
  if (/\|.+\|/.test(source) && /\|?\s*:?-+:?\s*\|/.test(source)) return true
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(source)) return true
  return false
}
