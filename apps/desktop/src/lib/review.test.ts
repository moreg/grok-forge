import { describe, expect, it } from 'vitest'
import {
  applyHunkDecisionsToContent,
  applyHunkDecisionsToDiff,
  buildFileDecisionChecklist,
  countHunkDecisions,
  formatFileDecisionChecklist,
  rejectHunkInContent,
  reconstructOriginal,
  reconstructUpdated,
  splitDiffIntoHunks,
  previewHunkDecisions,
  summarizeBatchApply,
  pathsToStageOnConfirm,
  summarizeFileAction,
  summarizeFileDecisionChecklist,
  summarizeHunkAction,
  summarizeReviewRestore,
  summarizeReviewStage,
  applyIgnoreWhitespace,
  buildAllHunkDecisions,
  countDiffChanges,
  flattenDiffViewBlocks,
  foldUnchangedDiff,
  highlightCodeLine,
  languageFromPath,
  normalizeWhitespace,
  patchExportFilename,
  summarizeFoldedLines,
  summarizeMarkAllHunks,
  summarizePatchCopy,
  summarizePatchExport,
  toMultiFilePatch,
  toSplitDiffRows,
  toUnifiedPatch,
  togglePinnedPath,
  workspaceFilesFingerprint,
} from './review'

describe('review helpers', () => {
  it('fingerprints workspace files by content, not array identity', () => {
    const a = [
      { path: 'b.ts', additions: 1, deletions: 0, patch: '+x' },
      { path: 'a.ts', additions: 0, deletions: 1, patch: '-y' },
    ]
    const b = [
      { path: 'a.ts', additions: 0, deletions: 1, patch: '-y' },
      { path: 'b.ts', additions: 1, deletions: 0, patch: '+x' },
    ]
    expect(workspaceFilesFingerprint(a)).toBe(workspaceFilesFingerprint(b))
    expect(workspaceFilesFingerprint(a)).not.toBe(
      workspaceFilesFingerprint([{ ...a[0], patch: '+changed' }, a[1]]),
    )
  })

  it('reconstructs original and updated text from diff lines', () => {
    const diff = [
      { type: 'same' as const, old: '1', next: '1', value: 'keep' },
      { type: 'remove' as const, old: '2', next: '', value: 'old' },
      { type: 'add' as const, old: '', next: '2', value: 'new' },
    ]
    expect(reconstructOriginal(diff)).toBe('keep\nold')
    expect(reconstructUpdated(diff)).toBe('keep\nnew')
  })

  it('summarizes accept and reject actions', () => {
    expect(summarizeFileAction('a.ts', 'accept')).toContain('暂存')
    expect(summarizeFileAction('a.ts', 'reject')).toContain('还原')
    expect(summarizeHunkAction('a.ts', 'h1', 'accept')).toContain('h1')
  })

  it('picks staging paths for confirm review and summarizes batch git results', () => {
    const files = [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }]
    expect(pathsToStageOnConfirm(files, ['a.ts'], ['b.ts'])).toEqual(['a.ts'])
    expect(pathsToStageOnConfirm(files, [], ['b.ts'])).toEqual(['a.ts', 'c.ts'])
    expect(summarizeReviewStage(2, 0)).toContain('暂存 2')
    expect(summarizeReviewStage(0, 0)).toContain('没有需要暂存')
    expect(summarizeReviewStage(1, 1)).toContain('失败 1')
    expect(summarizeReviewRestore(3, 0)).toContain('还原 3')
    expect(summarizeReviewRestore(0, 2)).toContain('Grok')
  })

  it('splits contiguous changes into hunks', () => {
    const diff = [
      { type: 'same' as const, old: '1', next: '1', value: 'a' },
      { type: 'add' as const, old: '', next: '2', value: 'b' },
      { type: 'same' as const, old: '2', next: '3', value: 'c' },
      { type: 'same' as const, old: '3', next: '4', value: 'd' },
      { type: 'same' as const, old: '4', next: '5', value: 'e' },
      { type: 'remove' as const, old: '5', next: '', value: 'f' },
    ]
    const hunks = splitDiffIntoHunks(diff, 1)
    expect(hunks.length).toBeGreaterThanOrEqual(2)
    expect(hunks[0].additions).toBe(1)
    expect(hunks.at(-1)?.deletions).toBe(1)
  })

  it('rejects a hunk inside working-tree content', () => {
    const content = 'keep\nnew\ntail\n'
    const hunk = {
      id: 'h1',
      title: 'change',
      additions: 1,
      deletions: 1,
      lines: [
        { type: 'same' as const, old: '1', next: '1', value: 'keep' },
        { type: 'remove' as const, old: '2', next: '', value: 'old' },
        { type: 'add' as const, old: '', next: '2', value: 'new' },
        { type: 'same' as const, old: '3', next: '3', value: 'tail' },
      ],
    }
    expect(rejectHunkInContent(content, hunk)).toBe('keep\nold\ntail\n')
  })

  it('reinserts pure deletions using surrounding context', () => {
    const content = 'keep\ntail'
    const hunk = {
      id: 'h2',
      title: 'deleted',
      additions: 0,
      deletions: 1,
      lines: [
        { type: 'same' as const, old: '1', next: '1', value: 'keep' },
        { type: 'remove' as const, old: '2', next: '', value: 'gone' },
        { type: 'same' as const, old: '3', next: '2', value: 'tail' },
      ],
    }
    expect(rejectHunkInContent(content, hunk)).toBe('keep\ngone\ntail')
  })

  it('throws when a rejected hunk cannot be located', () => {
    expect(() => rejectHunkInContent('unrelated\n', {
      id: 'h3',
      title: 'missing',
      additions: 1,
      deletions: 0,
      lines: [{ type: 'add', old: '', next: '1', value: 'missing-line' }],
    })).toThrow('无法在当前文件中定位该片段')
  })

  it('returns a single context hunk when there are no changes', () => {
    const diff = [{ type: 'same' as const, old: '1', next: '1', value: 'only' }]
    expect(splitDiffIntoHunks(diff)).toHaveLength(1)
    expect(splitDiffIntoHunks([])).toEqual([])
  })

  it('applies display-only hunk decisions for preview', () => {
    const diff = [
      { type: 'add' as const, old: '', next: '1', value: 'new' },
      { type: 'remove' as const, old: '1', next: '', value: 'old' },
      { type: 'same' as const, old: '2', next: '2', value: 'keep' },
    ]
    const hunks = splitDiffIntoHunks(diff, 0)
    const preview = applyHunkDecisionsToDiff(diff, hunks, { [hunks[0].id]: 'reject' })
    expect(preview.every((line) => line.type === 'same' || line.value === 'keep')).toBe(true)
  })

  it('batch-applies rejected hunks from bottom to top', () => {
    const content = 'keep\nnew\ntail\n'
    const hunk = {
      id: 'h1',
      title: 'change',
      additions: 1,
      deletions: 1,
      lines: [
        { type: 'same' as const, old: '1', next: '1', value: 'keep' },
        { type: 'remove' as const, old: '2', next: '', value: 'old' },
        { type: 'add' as const, old: '', next: '2', value: 'new' },
        { type: 'same' as const, old: '3', next: '3', value: 'tail' },
      ],
    }
    expect(applyHunkDecisionsToContent(content, [hunk], { h1: 'reject' })).toBe('keep\nold\ntail\n')
    expect(applyHunkDecisionsToContent(content, [hunk], { h1: 'accept' })).toBe(content)
    expect(countHunkDecisions({ h1: 'accept', h2: 'reject' })).toEqual({ accept: 1, reject: 1, total: 2 })
    expect(summarizeBatchApply('a.ts', 1, 2)).toContain('接受 1')
    expect(previewHunkDecisions([hunk], { h1: 'reject' })).toContain('拒绝')
    expect(previewHunkDecisions([hunk], {})).toContain('未决策')
  })

  it('builds a per-file decision checklist', () => {
    const files = [
      {
        path: 'src/a.ts',
        shortName: 'a.ts',
        additions: 1,
        deletions: 1,
        diff: [
          { type: 'same' as const, old: '1', next: '1', value: 'keep' },
          { type: 'remove' as const, old: '2', next: '', value: 'old' },
          { type: 'add' as const, old: '', next: '2', value: 'new' },
        ],
      },
      {
        path: 'src/b.ts',
        shortName: 'b.ts',
        additions: 1,
        deletions: 0,
        diff: [
          { type: 'add' as const, old: '', next: '1', value: 'only-new' },
        ],
      },
    ]
    const checklist = buildFileDecisionChecklist(
      files,
      ['src/a.ts'],
      [],
      { 'src/a.ts': { h1: 'accept' }, 'src/b.ts': { h1: 'reject' } },
    )
    expect(checklist).toHaveLength(2)
    expect(checklist[0]).toMatchObject({
      shortName: 'a.ts',
      fileDecision: 'accept',
      acceptHunks: 1,
      rejectHunks: 0,
    })
    expect(checklist[1]).toMatchObject({
      shortName: 'b.ts',
      fileDecision: 'pending',
      rejectHunks: 1,
    })
    const summary = summarizeFileDecisionChecklist(checklist)
    expect(summary).toMatchObject({ files: 2, accepted: 1, rejected: 0, pending: 1, acceptHunks: 1, rejectHunks: 1 })
    expect(formatFileDecisionChecklist(checklist)).toContain('a.ts')
    expect(formatFileDecisionChecklist(checklist)).toContain('合计')
    expect(formatFileDecisionChecklist([])).toContain('暂无')
  })

  it('builds side-by-side split rows and toggles pinned paths', () => {
    const diff = [
      { type: 'same' as const, old: '1', next: '1', value: 'keep' },
      { type: 'remove' as const, old: '2', next: '', value: 'old' },
      { type: 'add' as const, old: '', next: '2', value: 'new' },
      { type: 'add' as const, old: '', next: '3', value: 'extra' },
    ]
    const rows = toSplitDiffRows(diff)
    expect(rows[0]).toMatchObject({ oldKind: 'same', newKind: 'same', oldText: 'keep' })
    expect(rows[1]).toMatchObject({ oldKind: 'remove', newKind: 'add', oldText: 'old', newText: 'new' })
    expect(rows[2]).toMatchObject({ oldKind: 'empty', newKind: 'add', newText: 'extra' })
    expect(togglePinnedPath([], 'a')).toEqual(['a'])
    expect(togglePinnedPath(['a'], 'a')).toEqual([])
    expect(togglePinnedPath(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
  })

  it('exports unified and multi-file patches', () => {
    const diff = [
      { type: 'same' as const, old: '1', next: '1', value: 'keep' },
      { type: 'remove' as const, old: '2', next: '', value: 'old' },
      { type: 'add' as const, old: '', next: '2', value: 'new' },
    ]
    const patch = toUnifiedPatch('src\\auth.ts', diff)
    expect(patch).toContain('--- a/src/auth.ts')
    expect(patch).toContain('+++ b/src/auth.ts')
    expect(patch).toContain('@@ -1,2 +1,2 @@')
    expect(patch).toContain('-old')
    expect(patch).toContain('+new')
    const multi = toMultiFilePatch([
      { path: 'a.ts', diff },
      { path: 'b.ts', diff: [{ type: 'add', old: '', next: '1', value: 'only' }] },
    ])
    expect(multi).toContain('--- a/a.ts')
    expect(multi).toContain('--- a/b.ts')
    expect(patchExportFilename('src/auth.ts')).toMatch(/^grok-auth\.ts-\d{4}-\d{2}-\d{2}\.patch$/)
    expect(summarizePatchExport(2)).toContain('2')
    expect(summarizePatchExport(1, 'a.ts')).toContain('a.ts')
    expect(summarizePatchCopy(1, 'a.ts')).toContain('剪贴板')
    expect(summarizePatchCopy(3)).toContain('3')
  })

  it('folds long unchanged runs and expands when requested', () => {
    const pureSame = Array.from({ length: 10 }, (_, index) => ({
      type: 'same' as const,
      old: String(index + 1),
      next: String(index + 1),
      value: `line-${index + 1}`,
    }))
    const folded = foldUnchangedDiff(pureSame, { minCollapse: 6, edgeContext: 2 })
    expect(folded.some((block) => block.kind === 'fold')).toBe(true)
    const fold = folded.find((block) => block.kind === 'fold')
    expect(fold && fold.kind === 'fold' ? fold.count : 0).toBe(6)
    expect(summarizeFoldedLines(6)).toContain('6')
    const expanded = foldUnchangedDiff(pureSame, {
      minCollapse: 6,
      edgeContext: 2,
      expandedIds: fold && fold.kind === 'fold' ? [fold.id] : [],
    })
    expect(expanded.every((block) => block.kind === 'line')).toBe(true)
    expect(flattenDiffViewBlocks(expanded)).toHaveLength(10)
    expect(foldUnchangedDiff(pureSame.slice(0, 3))).toHaveLength(3)
  })

  it('builds bulk hunk decisions and summary copy', () => {
    const hunks = [
      { id: 'h1', title: 'a', lines: [], additions: 1, deletions: 0 },
      { id: 'h2', title: 'b', lines: [], additions: 0, deletions: 1 },
    ]
    expect(buildAllHunkDecisions(hunks, 'accept')).toEqual({ h1: 'accept', h2: 'accept' })
    expect(buildAllHunkDecisions(hunks, 'reject')).toEqual({ h1: 'reject', h2: 'reject' })
    expect(summarizeMarkAllHunks('a.ts', 2, 'accept')).toContain('接受')
    expect(summarizeMarkAllHunks('a.ts', 2, 'reject')).toContain('拒绝')
  })

  it('softens whitespace-only changes for display', () => {
    expect(normalizeWhitespace('  foo\t  bar  ')).toBe('foo bar')
    const diff = [
      { type: 'remove' as const, old: '1', next: '', value: 'const x = 1;' },
      { type: 'add' as const, old: '', next: '1', value: 'const  x = 1;' },
      { type: 'remove' as const, old: '2', next: '', value: '  ' },
      { type: 'add' as const, old: '', next: '2', value: 'real change' },
    ]
    const soft = applyIgnoreWhitespace(diff)
    expect(soft[0]).toMatchObject({ type: 'same', value: 'const  x = 1;' })
    expect(soft.some((line) => line.type === 'add' && line.value === 'real change')).toBe(true)
    expect(countDiffChanges(soft)).toEqual({ additions: 1, deletions: 0 })
  })

  it('highlights code tokens by language', () => {
    expect(languageFromPath('src/app.tsx')).toBe('ts')
    expect(languageFromPath('main.rs')).toBe('rs')
    const tokens = highlightCodeLine('const answer = 42; // done', 'ts')
    expect(tokens.some((token) => token.kind === 'keyword' && token.text === 'const')).toBe(true)
    expect(tokens.some((token) => token.kind === 'number' && token.text === '42')).toBe(true)
    expect(tokens.some((token) => token.kind === 'comment')).toBe(true)
    expect(highlightCodeLine('"hi"', 'ts').some((token) => token.kind === 'string')).toBe(true)
    expect(highlightCodeLine('plain', 'text')[0].kind).toBe('plain')
  })
})
