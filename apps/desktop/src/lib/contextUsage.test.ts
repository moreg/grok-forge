import { describe, expect, it } from 'vitest'
import {
  contextUsageLevel,
  contextUsagePercent,
  contextWindowForModel,
  estimateTaskContextUsage,
  estimateTokensFromText,
  formatContextUsageLabel,
  formatTokenCount,
  resolveContextUsage,
} from './contextUsage'

describe('contextUsage', () => {
  it('estimates tokens for mixed CJK and ASCII', () => {
    expect(estimateTokensFromText('')).toBe(0)
    expect(estimateTokensFromText('abcd')).toBe(1)
    expect(estimateTokensFromText('你好世界')).toBeGreaterThan(2)
  })

  it('picks context windows by model id', () => {
    expect(contextWindowForModel('grok-4.5')).toBe(256_000)
    expect(contextWindowForModel('grok-build')).toBe(256_000)
    expect(contextWindowForModel('grok-4')).toBe(128_000)
    expect(contextWindowForModel('unknown')).toBe(128_000)
  })

  it('estimates task usage from messages and live streams', () => {
    const snap = estimateTaskContextUsage({
      messages: [
        { role: 'user', content: '请修复登录' },
        { role: 'assistant', content: '已分析问题' },
      ],
      liveMessage: '继续…',
      liveThought: 'thinking',
      planSteps: [{ content: '读取文件', detail: 'src/a.ts' }],
      modelId: 'grok-4',
    })
    expect(snap.source).toBe('estimated')
    expect(snap.size).toBe(128_000)
    expect(snap.used).toBeGreaterThan(800)
    expect(snap.used).toBeLessThan(snap.size)
  })

  it('formats labels and levels', () => {
    expect(formatTokenCount(950)).toBe('950')
    expect(formatTokenCount(12_400)).toBe('12k')
    expect(formatTokenCount(1_200)).toBe('1.2k')
    expect(contextUsagePercent(50, 100)).toBe(50)
    expect(contextUsagePercent(10, 0)).toBe(0)
    expect(contextUsageLevel(10)).toBe('ok')
    expect(contextUsageLevel(80)).toBe('warn')
    expect(contextUsageLevel(92)).toBe('high')
    expect(contextUsageLevel(97)).toBe('critical')
    expect(formatContextUsageLabel({ used: 12_400, size: 128_000, source: 'estimated' })).toContain('12k')
  })

  it('prefers fresh agent usage, then grows with local estimate when stale or higher', () => {
    const now = 1_000_000
    const resolved = resolveContextUsage(
      { used: 53_000, size: 200_000, cost: { amount: 0.04, currency: 'USD' }, at: now - 1_000 },
      { messages: [{ content: 'hi' }], modelId: 'grok-4' },
      now,
    )
    expect(resolved).toMatchObject({
      used: 53_000,
      size: 200_000,
      source: 'agent',
      cost: { amount: 0.04, currency: 'USD' },
    })
    expect(resolveContextUsage(null, { messages: [], modelId: 'grok-4' }).source).toBe('estimated')

    const stale = resolveContextUsage(
      { used: 1_000, size: 200_000, at: now - 60_000 },
      {
        messages: [{ content: 'x'.repeat(20_000) }],
        modelId: 'grok-4',
      },
      now,
    )
    expect(stale.source).toBe('estimated')
    expect(stale.used).toBeGreaterThan(1_000)
  })

  it('does not clamp estimated used to the window size', () => {
    const snap = estimateTaskContextUsage({
      messages: [{ content: '字'.repeat(500_000) }],
      modelId: 'grok-4',
    })
    expect(snap.used).toBeGreaterThan(snap.size)
  })
})
