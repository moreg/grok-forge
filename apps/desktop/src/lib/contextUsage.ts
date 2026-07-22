/**
 * Conversation context-window usage: agent-reported preferred, local estimate fallback.
 */

export type ContextUsageSource = 'agent' | 'estimated'

export type ContextUsageCost = {
  amount: number
  currency: string
}

export type ContextUsageSnapshot = {
  used: number
  size: number
  source: ContextUsageSource
  cost?: ContextUsageCost
}

export type ContextUsageLevel = 'ok' | 'warn' | 'high' | 'critical'

/** Rough token estimate: CJK denser than ASCII (mixed coding chats). */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    // CJK Unified Ideographs + common CJK punctuation range
    if (
      (code >= 0x4e00 && code <= 0x9fff)
      || (code >= 0x3400 && code <= 0x4dbf)
      || (code >= 0x3000 && code <= 0x303f)
    ) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.max(0, Math.ceil(cjk * 0.7 + other / 4))
}

/** Default context window by model id (agent size wins when reported). */
export function contextWindowForModel(modelId: string): number {
  const id = (modelId || '').toLowerCase()
  if (id.includes('4.5') || id.includes('grok-build')) return 256_000
  if (id.includes('grok-4') || id.includes('grok-3')) return 128_000
  return 128_000
}

export type ContextEstimateInput = {
  messages: Array<{ role?: string; content: string }>
  liveMessage?: string
  liveThought?: string
  planSteps?: Array<{ content: string; detail?: string }>
  modelId?: string
}

/** Local fallback when the agent has not sent usage_update. */
export function estimateTaskContextUsage(input: ContextEstimateInput): ContextUsageSnapshot {
  let used = 800 // system / tooling baseline
  for (const message of input.messages) {
    used += 4
    used += estimateTokensFromText(message.content)
  }
  used += estimateTokensFromText(input.liveMessage ?? '')
  used += estimateTokensFromText(input.liveThought ?? '')
  for (const step of input.planSteps ?? []) {
    used += estimateTokensFromText(step.content)
    used += estimateTokensFromText(step.detail ?? '')
  }
  const size = contextWindowForModel(input.modelId ?? '')
  // Keep raw used even if > size so the UI can show "over budget" absolute counts.
  return {
    used,
    size,
    source: 'estimated',
  }
}

export function contextUsagePercent(used: number, size: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(size) || size <= 0) return 0
  return Math.min(100, Math.max(0, (used / size) * 100))
}

export function contextUsageLevel(percent: number): ContextUsageLevel {
  if (percent >= 95) return 'critical'
  if (percent >= 90) return 'high'
  if (percent >= 75) return 'warn'
  return 'ok'
}

export function formatTokenCount(tokens: number): string {
  const n = Math.max(0, Math.round(tokens))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatContextUsageLabel(snapshot: ContextUsageSnapshot): string {
  const percent = contextUsagePercent(snapshot.used, snapshot.size)
  const base = `${formatTokenCount(snapshot.used)} / ${formatTokenCount(snapshot.size)} · ${percent.toFixed(percent >= 10 ? 0 : 1)}%`
  return base
}

export function formatContextUsageHint(snapshot: ContextUsageSnapshot): string {
  const percent = contextUsagePercent(snapshot.used, snapshot.size)
  const level = contextUsageLevel(percent)
  const source = snapshot.source === 'agent' ? '来自 Agent 上报' : '本地估算（消息与计划文本）'
  let advice = '上下文占用正常'
  if (level === 'warn') advice = '上下文逐渐占满，可考虑压缩或新开会话'
  if (level === 'high') advice = '上下文较高，建议新开会话或总结后再继续'
  if (level === 'critical') advice = '接近上限，下一轮可能失败 — 建议 handoff / 新会话'
  let cost = ''
  if (snapshot.cost && Number.isFinite(snapshot.cost.amount)) {
    cost = ` · 累计费用 ${snapshot.cost.amount} ${snapshot.cost.currency}`
  }
  return `${source}${cost}\n${advice}`
}

export type AgentUsageReading = {
  used: number
  size: number
  cost?: ContextUsageCost
  /** Wall-clock ms when this reading was received. */
  at: number
}

/** Prefer agent readings while fresh; never let the meter freeze below a higher local estimate. */
export function resolveContextUsage(
  agent: AgentUsageReading | null | undefined,
  estimateInput: ContextEstimateInput,
  now = Date.now(),
  maxAgentAgeMs = 45_000,
): ContextUsageSnapshot {
  const estimate = estimateTaskContextUsage(estimateInput)
  if (
    !agent
    || !Number.isFinite(agent.used)
    || !Number.isFinite(agent.size)
    || agent.size <= 0
  ) {
    return estimate
  }

  const fresh = Number.isFinite(agent.at) && (now - agent.at) <= maxAgentAgeMs
  const used = Math.max(0, Math.max(agent.used, estimate.used))
  const size = agent.size

  if (fresh && agent.used >= estimate.used) {
    return {
      used: Math.max(0, agent.used),
      size,
      source: 'agent',
      cost: agent.cost,
    }
  }

  // Stale agent data, or local estimate has grown past the last report.
  return {
    used,
    size,
    source: 'estimated',
    cost: agent.cost,
  }
}
