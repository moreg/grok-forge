import { beforeEach, describe, expect, it } from 'vitest'
import {
  MCP_TEMPLATES,
  applyMcpTemplate,
  createEmptyMcpServer,
  formatArgsInput,
  formatEnvInput,
  loadMcpServers,
  parseArgsInput,
  parseEnvInput,
  saveMcpServers,
  toSessionMcpServers,
} from './mcp'

beforeEach(() => {
  localStorage.clear()
})

describe('mcp helpers', () => {
  it('loads an empty list by default and persists valid servers', () => {
    expect(loadMcpServers()).toEqual([])
    saveMcpServers([
      { name: 'filesystem', command: 'npx', args: ['-y', 'server'], env: [{ name: 'A', value: '1' }] },
      { name: '', command: 'skip', args: [] },
    ])
    expect(loadMcpServers()).toEqual([
      { name: 'filesystem', command: 'npx', args: ['-y', 'server'], env: [{ name: 'A', value: '1' }] },
    ])
  })

  it('parses args and maps session payload', () => {
    expect(parseArgsInput('  -y  pkg  ')).toEqual(['-y', 'pkg'])
    expect(formatArgsInput(['-y', 'pkg'])).toBe('-y pkg')
    expect(createEmptyMcpServer()).toEqual({ name: '', command: '', args: [], env: [] })
    expect(toSessionMcpServers([
      { name: ' fs ', command: ' npx ', args: ['-y'], env: [] },
      { name: '', command: 'x', args: [] },
    ])).toEqual([{ name: 'fs', command: 'npx', args: ['-y'], env: [] }])
  })

  it('parses and formats MCP env KEY=value lines', () => {
    expect(parseEnvInput('API_KEY=abc=def\n# comment\nDEBUG=1\nbad\n=skip\n')).toEqual([
      { name: 'API_KEY', value: 'abc=def' },
      { name: 'DEBUG', value: '1' },
    ])
    expect(formatEnvInput([{ name: 'A', value: '1' }, { name: 'B', value: 'x=y' }])).toBe('A=1\nB=x=y')
    expect(formatEnvInput(undefined)).toBe('')
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('grok-forge-mcp-servers', '{bad')
    expect(loadMcpServers()).toEqual([])
    localStorage.setItem('grok-forge-mcp-servers', JSON.stringify([{ name: 1 }]))
    expect(loadMcpServers()).toEqual([])
  })

  it('accepts string args and skips invalid env entries', () => {
    localStorage.setItem('grok-forge-mcp-servers', JSON.stringify([
      { name: 'fs', command: 'npx', args: '--stdio -y pkg', env: [{ name: 'OK', value: '1' }, { name: 1 }, null] },
      null,
      { name: 'bad' },
    ]))
    expect(loadMcpServers()).toEqual([
      { name: 'fs', command: 'npx', args: ['--stdio', '-y', 'pkg'], env: [{ name: 'OK', value: '1' }] },
    ])
  })

  it('applies MCP templates without duplicating names', () => {
    expect(MCP_TEMPLATES.length).toBeGreaterThan(0)
    const first = applyMcpTemplate([], MCP_TEMPLATES[0])
    expect(first.added).toBe(true)
    expect(first.servers).toHaveLength(1)
    const second = applyMcpTemplate(first.servers, MCP_TEMPLATES[0])
    expect(second.added).toBe(false)
    expect(second.servers).toHaveLength(1)
  })
})
