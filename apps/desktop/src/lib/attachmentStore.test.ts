import { describe, expect, it, vi } from 'vitest'
import {
  ensureWorkspaceGrokForgeGitignore,
  isCachedDataUrlPath,
  joinWorkspacePath,
  makeAttachmentCachePath,
  persistAttachmentList,
  persistDataUrlAttachment,
  resolveAttachmentForUse,
  resolveAttachmentList,
} from './attachmentStore'

describe('attachmentStore', () => {
  it('joins workspace cache paths and detects them', () => {
    const win = makeAttachmentCachePath('E:\\repo', 'att-1')
    expect(win.replace(/\\/g, '/')).toContain('.grok-forge/attachments/att-1.dataurl')
    expect(isCachedDataUrlPath(win)).toBe(true)
    expect(isCachedDataUrlPath('E:\\repo\\src\\a.ts')).toBe(false)
    expect(joinWorkspacePath('/home/me/proj', 'a', 'b')).toBe('/home/me/proj/a/b')
  })

  it('persists data URLs to disk and leaves file paths alone', async () => {
    const write = vi.fn(async (_path: string, _content: string) => undefined)
    const data = 'data:image/png;base64,abc'
    const stored = await persistDataUrlAttachment(data, 'C:\\ws', write)
    // gitignore ensure + data URL body
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls.some((call) => call[1] === data)).toBe(true)
    expect(isCachedDataUrlPath(stored)).toBe(true)

    expect(await persistDataUrlAttachment('C:\\ws\\file.ts', 'C:\\ws', write)).toBe('C:\\ws\\file.ts')
    expect(await persistDataUrlAttachment(data, undefined, write)).toBe(data)
  })

  it('resolves cached paths back to data URLs', async () => {
    const path = makeAttachmentCachePath('/tmp/ws', 'x')
    const read = vi.fn(async () => 'data:image/png;base64,qq')
    expect(await resolveAttachmentForUse(path, read)).toBe('data:image/png;base64,qq')
    expect(await resolveAttachmentForUse('/tmp/ws/a.ts', read)).toBe('/tmp/ws/a.ts')

    const list = await resolveAttachmentList([path, '/tmp/a.ts'], read)
    expect(list).toEqual(['data:image/png;base64,qq', '/tmp/a.ts'])
  })

  it('keeps data URLs when write fails', async () => {
    const write = vi.fn(async () => {
      throw new Error('disk full')
    })
    const list = await persistAttachmentList(
      ['data:image/png;base64,zz'],
      'C:\\ws',
      write,
    )
    expect(list).toEqual(['data:image/png;base64,zz'])
  })

  it('appends .grok-forge/ to workspace .gitignore once', async () => {
    const write = vi.fn(async (_path: string, _content: string) => undefined)
    const read = vi.fn(async () => 'node_modules/\n')
    await ensureWorkspaceGrokForgeGitignore('C:\\ws', write, read)
    expect(write).toHaveBeenCalledOnce()
    const firstBody = write.mock.calls[0]?.[1] as string
    expect(firstBody).toContain('.grok-forge/')
    expect(firstBody).toContain('node_modules/')

    write.mockClear()
    const readAgain = vi.fn(async () => 'node_modules/\n.grok-forge/\n')
    await ensureWorkspaceGrokForgeGitignore('C:\\ws', write, readAgain)
    expect(write).not.toHaveBeenCalled()
  })
})
