export type McpServerConfig = {
  name: string
  command: string
  args: string[]
  env?: Array<{ name: string; value: string }>
}

const MCP_KEY = 'grok-forge-mcp-servers'

export function loadMcpServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(MCP_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): McpServerConfig[] => {
      if (entry === null || typeof entry !== 'object') return []
      const row = entry as Record<string, unknown>
      if (typeof row.name !== 'string' || !row.name.trim()) return []
      if (typeof row.command !== 'string' || !row.command.trim()) return []
      const args = Array.isArray(row.args)
        ? row.args.filter((item): item is string => typeof item === 'string')
        : typeof row.args === 'string'
          ? row.args.split(/\s+/).filter(Boolean)
          : []
      const env = Array.isArray(row.env)
        ? row.env.flatMap((item) => {
          if (item === null || typeof item !== 'object') return []
          const envRow = item as Record<string, unknown>
          if (typeof envRow.name !== 'string' || typeof envRow.value !== 'string') return []
          return [{ name: envRow.name, value: envRow.value }]
        })
        : []
      return [{ name: row.name.trim(), command: row.command.trim(), args, env }]
    })
  } catch {
    return []
  }
}

export function saveMcpServers(servers: McpServerConfig[]) {
  localStorage.setItem(MCP_KEY, JSON.stringify(servers))
}

export function parseArgsInput(value: string) {
  return value.trim() ? value.trim().split(/\s+/) : []
}

export function formatArgsInput(args: string[]) {
  return args.join(' ')
}

export function createEmptyMcpServer(): McpServerConfig {
  return { name: '', command: '', args: [], env: [] }
}

export type McpServerTemplate = McpServerConfig & {
  id: string
  description: string
}

/** One-click MCP templates for the capability panel / settings. */
export const MCP_TEMPLATES: McpServerTemplate[] = [
  {
    id: 'filesystem',
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    description: '读写当前工作区文件（stdio）',
  },
  {
    id: 'memory',
    name: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: '本地知识图谱记忆',
  },
  {
    id: 'github',
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: [{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: '' }],
    description: 'GitHub issues / PR（需填写 token）',
  },
  {
    id: 'fetch',
    name: 'fetch',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    description: 'HTTP 抓取网页内容',
  },
]

/** Merge a template into the list; skips if the same name already exists. */
export function applyMcpTemplate(
  servers: McpServerConfig[],
  template: McpServerTemplate | McpServerConfig,
): { servers: McpServerConfig[]; added: boolean } {
  const name = template.name.trim()
  if (!name) return { servers, added: false }
  if (servers.some((server) => server.name.trim().toLowerCase() === name.toLowerCase())) {
    return { servers, added: false }
  }
  const next: McpServerConfig = {
    name,
    command: template.command,
    args: [...(template.args ?? [])],
    env: template.env ? template.env.map((entry) => ({ ...entry })) : [],
  }
  return { servers: [...servers, next], added: true }
}

/** Serialize env pairs for a textarea (`NAME=value` per line). */
export function formatEnvInput(env: Array<{ name: string; value: string }> | undefined) {
  return (env ?? []).map((entry) => `${entry.name}=${entry.value}`).join('\n')
}

/**
 * Parse env lines. Accepts `NAME=value` (value may contain `=`).
 * Blank lines and lines without `=` are ignored.
 */
export function parseEnvInput(value: string): Array<{ name: string; value: string }> {
  return value
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return []
      const eq = trimmed.indexOf('=')
      if (eq <= 0) return []
      const name = trimmed.slice(0, eq).trim()
      const envValue = trimmed.slice(eq + 1)
      if (!name) return []
      return [{ name, value: envValue }]
    })
}

export function toSessionMcpServers(servers: McpServerConfig[]) {
  return servers
    .filter((server) => server.name.trim() && server.command.trim())
    .map((server) => ({
      name: server.name.trim(),
      command: server.command.trim(),
      args: server.args,
      env: server.env ?? [],
    }))
}
