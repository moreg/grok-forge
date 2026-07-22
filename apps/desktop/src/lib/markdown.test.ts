import { describe, expect, it } from 'vitest'
import {
  looksLikeMarkdown,
  normalizeMarkdownLanguage,
  parseInline,
  parseMarkdown,
  safeMarkdownHref,
} from './markdown'

describe('markdown helpers', () => {
  it('normalizes fence languages', () => {
    expect(normalizeMarkdownLanguage('TypeScript')).toBe('ts')
    expect(normalizeMarkdownLanguage('python')).toBe('py')
    expect(normalizeMarkdownLanguage('')).toBe('text')
    expect(normalizeMarkdownLanguage('rust')).toBe('rs')
  })

  it('rejects unsafe hrefs and allows safe ones', () => {
    expect(safeMarkdownHref('https://x.ai')).toBe('https://x.ai')
    expect(safeMarkdownHref('#section')).toBe('#section')
    expect(safeMarkdownHref('./docs/a.md')).toBe('./docs/a.md')
    expect(safeMarkdownHref('javascript:alert(1)')).toBeNull()
    expect(safeMarkdownHref('data:text/html,hi')).toBeNull()
  })

  it('parses headings, lists, code fences, and quotes', () => {
    const blocks = parseMarkdown([
      '# Title',
      '',
      'Hello **world** and `code`.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '> note line',
      '',
      '---',
      '',
      'See [docs](https://example.com).',
    ].join('\n'))

    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true)
    expect(blocks.some((b) => b.type === 'list' && !b.ordered)).toBe(true)
    expect(blocks.some((b) => b.type === 'list' && b.ordered)).toBe(true)
    const code = blocks.find((b) => b.type === 'code')
    expect(code).toMatchObject({ type: 'code', language: 'ts', code: 'const x = 1' })
    expect(blocks.some((b) => b.type === 'blockquote')).toBe(true)
    expect(blocks.some((b) => b.type === 'hr')).toBe(true)
    const withLink = blocks.find((b) => b.type === 'paragraph' && b.children.some((c) => c.type === 'link'))
    expect(withLink).toBeTruthy()
  })

  it('parses inline emphasis and nested strong', () => {
    const nodes = parseInline('a **bold *nested* text** and `x`')
    expect(nodes.some((n) => n.type === 'strong')).toBe(true)
    expect(nodes.some((n) => n.type === 'code' && n.text === 'x')).toBe(true)
  })

  it('supports hard line breaks via trailing spaces', () => {
    const blocks = parseMarkdown('line one  \nline two')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('paragraph')
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children.some((n) => n.type === 'br')).toBe(true)
    }
  })

  it('detects markdown-ish content', () => {
    expect(looksLikeMarkdown('plain text only')).toBe(false)
    expect(looksLikeMarkdown('use `foo` here')).toBe(true)
    expect(looksLikeMarkdown('```\nok\n```')).toBe(true)
    expect(looksLikeMarkdown('# Heading')).toBe(true)
    expect(looksLikeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(true)
    expect(looksLikeMarkdown('- [x] done')).toBe(true)
  })

  it('keeps escaped characters as plain text', () => {
    const nodes = parseInline('\\*not bold\\*')
    expect(nodes).toEqual([{ type: 'text', text: '*not bold*' }])
  })

  it('parses GFM tables', () => {
    const blocks = parseMarkdown([
      '| Name | Score |',
      '| :--- | ---: |',
      '| Alice | 10 |',
      '| Bob | 8 |',
    ].join('\n'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    if (blocks[0].type === 'table') {
      expect(blocks[0].header).toHaveLength(2)
      expect(blocks[0].rows).toHaveLength(2)
      expect(blocks[0].aligns).toEqual(['left', 'right'])
    }
  })

  it('parses task list items', () => {
    const blocks = parseMarkdown('- [ ] todo\n- [x] done\n- plain')
    expect(blocks[0].type).toBe('list')
    if (blocks[0].type === 'list') {
      expect(blocks[0].items[0].checked).toBe(false)
      expect(blocks[0].items[1].checked).toBe(true)
      expect(blocks[0].items[2].checked).toBeUndefined()
    }
  })

  it('linkifies repo file paths in plain text', () => {
    const nodes = parseInline('see src/app/main.ts:42 for details')
    expect(nodes.some((n) => n.type === 'path' && n.path === 'src/app/main.ts' && n.line === 42)).toBe(true)
  })

  it('does not linkify URL host/path fragments', () => {
    const https = parseInline('see https://example.com/a/b.js for docs')
    expect(https.some((n) => n.type === 'path')).toBe(false)

    const localhost = parseInline('open http://localhost:3000/src/main.ts')
    expect(localhost.some((n) => n.type === 'path')).toBe(false)

    // Relative repo paths still work.
    const rel = parseInline('edit ./src/main.ts please')
    expect(rel.some((n) => n.type === 'path' && n.path === './src/main.ts')).toBe(true)
  })
})
